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

Proxifier.prototype.proxiedURL = function(url, baseURL) {
  if (!url) return '';
  var parsed = urlModule.parse(url);
  if (!(parsed.protocol === null ||
        /^https?:/.test(parsed.protocol)))
    return url;
  if (baseURL)
    url = urlModule.resolve(baseURL, url);
  return this.rewriteURL(url);
};

Proxifier.prototype.alterHTML = function(baseURL, html, res, next) {
  var self = this;
  var $ = cheerio.load(html);
  var rewriteAttrURL = function(attrName) {
    var selector = '[' + attrName.replace(':', '\\:') + ']';
    $(selector).each(function() {
      var url = $(this).attr(attrName);
      $(this).attr(attrName, self.proxiedURL(url, baseURL));
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
    $(this).attr('style', self.alterCSSString(baseURL, style));
  });
  $('style').each(function() {
    $(this).text(self.alterCSSString(baseURL, $(this).text(), true));
  });
  $('script').remove();

  return res.type('text/html; charset=utf-8')
    .send(new Buffer($.html(), 'utf-8'));
}

Proxifier.prototype.alterCSSString = function(baseURL, css, ignorePrettify) {
  var self = this;

  if (!ignorePrettify) {
    try {
      css = cssModule.stringify(cssModule.parse(css));
    } catch (e) {}
  }
  css = css.replace(/url\(([^)]+)\)/g, function(matchedStr, url) {
    return 'url(' + self.proxiedURL(unquote(url), baseURL) + ')';
  });

  return css;
}

Proxifier.prototype.alterCSS = function(baseURL, css, res, next) {
  var css = this.alterCSSString(baseURL, css);

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

    if (proxyRes.headers['location'] && proxyRes.statusCode > 300 &&
        proxyRes.statusCode < 304) {
      return res.redirect(
        proxyRes.statusCode,
        self.proxiedURL(proxyRes.headers['location'], url)
      );
    }

    if (ext in self.EXT_HANDLERS)
      return getBody(type, 'utf-8', proxyRes, function(err, body) {
        if (err) return next(err);
        return self.EXT_HANDLERS[ext].call(self, url, body, res, next);
      });

    res.status(proxyRes.statusCode).type(type);
    proxyRes.pipe(res);
  });
};

Proxifier.prototype.proxifyFormSubmission = function(req, res, next) {
  if (!req.query.proxy_originalAction)
    return res.status(400).send("proxy_originalAction required");

  var urlInfo = urlModule.parse(req.query.proxy_originalAction);

  delete urlInfo.search;
  urlInfo.query = _.omit(req.query, 'proxy_originalAction');
  return this.proxify(urlModule.format(urlInfo), res, next);
};

Proxifier.prototype.EXT_HANDLERS = {
  'html': Proxifier.prototype.alterHTML,
  'css': Proxifier.prototype.alterCSS
};

module.exports = Proxifier;
