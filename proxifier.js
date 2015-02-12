var urlModule = require('url');
var _ = require('underscore');
var cssModule = require('css');
var iconv = require('iconv-lite');
var cheerio = require('cheerio');
var mime = require('mime');

function unquote(str) {
  var first = str[0];
  var last = str[str.length - 1];

  if (first != last) return str;
  if (first == "'" || first == '"')
    return str.slice(1, -1);
}

function getBody(type, defaultType, stream, cb) {
  var charset = (type.match(/charset=([A-Za-z0-9\-]+)/) ||
                 [,defaultType])[1];
  var chunks = [];

  stream.on('data', function(chunk) { chunks.push(chunk); });
  stream.on('end', function() {
    var buf = Buffer.concat(chunks);

    cb(null, iconv.decode(buf, charset));
  });
  stream.on('error', cb);
}

function Proxifier(options) {
  this.rewriteURL = options.rewriteURL;
  this.request = options.request;
  this.formSubmitURL = options.formSubmitURL;
}

Proxifier.prototype.proxiedURL = function(url, baseURL, type) {
  if (!url) return '';
  var parsed = urlModule.parse(url);
  if (!(parsed.protocol === null || /^https?:/.test(parsed.protocol))) {
    // It's probably a data/mailto/etc URL, don't proxy anything.
    return url;
  }
  if (baseURL)
    url = urlModule.resolve(baseURL, url);
  return this.rewriteURL(url, baseURL, type);
};

Proxifier.prototype.alterHTML = function(baseURL, html, res, next) {
  var self = this;
  var $ = cheerio.load(html);
  var rewriteAttrURL = function(attrName) {
    var selector = '[' + attrName.replace(':', '\\:') + ']';
    $(selector).each(function() {
      var url = $(this).attr(attrName);
      res.emit('linkedResource', {
        baseURL: baseURL,
        url: url,
        type: 'html',
        nodeName: this.name,
        relType: (this.name == 'link') ? $(this).attr('rel') : null,
        attribute: attrName
      });
      $(this).attr(attrName, self.proxiedURL(url, baseURL, 'html'));
    });
  };

  rewriteAttrURL('src');
  rewriteAttrURL('href');
  rewriteAttrURL('xlink:href');

  $('form').each(function() {
    var originalAction = urlModule.resolve(baseURL, $(this).attr('action') || '');
    var input = $('<input type="hidden" name="proxy_originalAction">');
    input.attr('value', originalAction);
    $(this).append(input);
    $(this).attr('action', self.formSubmitURL);
  });
  $('[style]').each(function() {
    var style = $(this).attr('style');
    $(this).attr('style', self.alterCSSString(baseURL, style, false, res));
  });
  $('style').each(function() {
    $(this).text(self.alterCSSString(baseURL, $(this).text(), true, res));
  });
  $('script, object').remove();

  // Websites with <meta viewport> tags often hide many of
  // their most useful links inside a JS-powered hamburger,
  // so delete the tag.
  $('meta[name="viewport"]').remove();

  // TODO: Ensure the HTML output has a <meta charset="utf-8"> tag.

  return res.type('text/html; charset=utf-8')
    .send(new Buffer($.html(), 'utf-8'));
}

Proxifier.prototype.alterCSSString = function(baseURL, css, noPrettify, e) {
  var self = this;

  if (!noPrettify) {
    try {
      css = cssModule.stringify(cssModule.parse(css));
    } catch (e) {}
  }
  css = css.replace(/url\(([^)]+)\)/g, function(matchedStr, url) {
    url = unquote(url)
    e.emit('linkedResource', {
      baseURL: baseURL,
      url: url,
      type: 'css'
    });
    return 'url(' + self.proxiedURL(url, baseURL, 'css') + ')';
  });

  return css;
}

Proxifier.prototype.alterCSS = function(baseURL, css, res, next) {
  var css = this.alterCSSString(baseURL, css, false, res);

  return res.type('text/css; charset=utf-8')
    .send(new Buffer(css, 'utf-8'));
}

Proxifier.prototype.proxify = function(url, res, next) {
  var self = this;
  var proxyReq = self.request.get(url);

  proxyReq.on('response', function(proxyRes) {
    var type = proxyRes.headers['content-type'] ||
               'application/octet-stream';
    var ext = mime.extension(type);

    if ('wasAlreadyCached' in proxyRes)
      res.wasAlreadyCached = proxyRes.wasAlreadyCached;

    if (proxyRes.headers['location'] && proxyRes.statusCode > 300 &&
        proxyRes.statusCode < 304) {
      return res.redirect(
        proxyRes.statusCode,
        self.proxiedURL(proxyRes.headers['location'], url, 'redirect')
      );
    }

    if (ext in self.EXT_HANDLERS)
      return getBody(type, 'utf-8', proxyRes, function(err, body) {
        if (err) return next(err);
        res.status(proxyRes.statusCode);
        return self.EXT_HANDLERS[ext].call(self, url, body, res, next);
      });

    res.status(proxyRes.statusCode).type(type);
    proxyRes.pipe(res);
  }).on('error', next);
};

Proxifier.prototype.getFormSubmitRedirect = function(req) {
  if (!req.query.proxy_originalAction) return null;

  var urlInfo = urlModule.parse(req.query.proxy_originalAction);

  delete urlInfo.search;
  urlInfo.query = _.omit(req.query, 'proxy_originalAction');

  return urlModule.format(urlInfo);
};

Proxifier.prototype.EXT_HANDLERS = {
  'html': Proxifier.prototype.alterHTML,
  'css': Proxifier.prototype.alterCSS
};

module.exports = Proxifier;
