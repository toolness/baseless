var fs = require('fs');
var urlModule = require('url');
var cssModule = require('css');
var iconv = require('iconv-lite');
//var request = require('request');
var request = require('./cached-request');
var cheerio = require('cheerio');
var mime = require('mime');
var express = require('express');

var PORT = process.env.PORT || 3000;
var EXT_HANDLERS = {
  'html': alterHTML,
  'css': alterCSS
};
var app = express();

function proxiedURL(url, baseURL) {
  if (!url) return '';
  var parsed = urlModule.parse(url);
  if (!(parsed.protocol === null ||
        /^https?:/.test(parsed.protocol)))
    return url;
  if (baseURL)
    url = urlModule.resolve(baseURL, url);
  return '/proxy?url=' + encodeURIComponent(url);
}

function alterHTML(baseURL, html, res, next) {
  var $ = cheerio.load(html);
  var rewriteAttrURL = function(attrName) {
    var selector = '[' + attrName.replace(':', '\\:') + ']';
    $(selector).each(function() {
      var url = $(this).attr(attrName);
      $(this).attr(attrName, proxiedURL(url, baseURL));
    });
  };

  rewriteAttrURL('src');
  rewriteAttrURL('href');
  rewriteAttrURL('xlink:href');

  $('[style]').each(function() {
    var style = $(this).attr('style');
    $(this).attr('style', alterCSSString(baseURL, style));
  });
  $('style').each(function() {
    $(this).text(alterCSSString(baseURL, $(this).text(), true));
  });
  $('script').remove();

  return res.type('text/html; charset=utf-8')
    .send(new Buffer($.html(), 'utf-8'));
}

function unquote(str) {
  var first = str[0];
  var last = str[str.length - 1];

  if (first != last) return str;
  if (first == "'" || first == '"')
    return str.slice(1, -1);
}

function alterCSSString(baseURL, css, ignorePrettify) {
  if (!ignorePrettify) {
    try {
      css = cssModule.stringify(cssModule.parse(css));
    } catch (e) {}
  }
  css = css.replace(/url\(([^)]+)\)/g, function(matchedStr, url) {
    return 'url(' + proxiedURL(unquote(url), baseURL) + ')';
  });

  return css;
}

function alterCSS(baseURL, css, res, next) {
  var css = alterCSSString(baseURL, css);

  return res.type('text/css; charset=utf-8')
    .send(new Buffer(css, 'utf-8'));
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

function proxify(url, res, next) {
  var proxyReq = request.get(url);

  proxyReq.on('response', function(proxyRes) {
    var type = proxyRes.headers['content-type'] ||
               'application/octet-stream';
    var ext = mime.extension(type);

    if (ext in EXT_HANDLERS)
      return getBody(type, 'utf-8', proxyRes, function(err, body) {
        if (err) return next(err);
        return EXT_HANDLERS[ext](url, body, res, next);
      });

    res.status(proxyRes.statusCode).type(type);
    proxyRes.pipe(res);
  });
}

app.get('/proxy', function(req, res, next) {
  if (!req.query.url)
    return res.status(400).send("url parameter required");

  res.set('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'none'",
    "style-src 'unsafe-inline' 'self'",
    "img-src 'self' data:"
  ].join('; '));

  return proxify(req.query.url, res, next);
});

app.get('/', function(req, res, next) {
  return fs.createReadStream(__dirname + '/index.html')
    .pipe(res.type('text/html'));
});

app.listen(PORT, function() {
  console.log("listening on port " + PORT);
});
