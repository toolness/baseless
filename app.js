var express = require('express');
var basicAuth = require('basic-auth');
var browserify = require('browserify');
var urls = require('./urls');
var Proxifier = require('./proxifier');
var cachedRequest = require('./cached-request');

var PORT = process.env.PORT || 3000;
var DEBUG = 'DEBUG' in process.env;
var USERPASS = (process.env.USERPASS || '').split(':');

var bundlejs;
var app = express();
var proxifier = new Proxifier({
  rewriteURL: urls.rewriteURL,
  formSubmitURL: '/proxy/submit',
  request: cachedRequest
});

if (USERPASS.length == 2)
  app.use(function(req, res, next) {
    var user = basicAuth(req);
    if (!user || user.name != USERPASS[0] ||
        user.pass != USERPASS[1]) {
      res.set('WWW-Authenticate',
              'Basic realm=Authorization Required');
      return res.sendStatus(401);
    }

    next();
  });

app.use('/proxy', function(req, res, next) {
  res.set('Content-Security-Policy', [
    "default-src 'self' data:",
    "script-src 'self'",
    "style-src 'unsafe-inline' 'self'"
  ].join('; '));
  next();
});

app.get('/proxy', function(req, res, next) {
  if (!req.query.url)
    return res.status(400).send("url parameter required");

  return proxifier.proxify(req.query.url, res, next);
});

app.get('/proxy/submit', function(req, res, next) {
  var url = proxifier.getFormSubmitRedirect(req);

  if (!url) return res.sendStatus(400);
  return res.redirect('/proxy?url=' + encodeURIComponent(url));
});

app.get('/js/bundle.js', function(req, res, next) {
  if (!bundlejs || DEBUG) {
    var b = browserify();
    b.require('querystring');
    b.require('./urls');
    b.bundle(function(err, buf) {
      if (err) return next(err);
      bundlejs = buf;
      next();
    });
  } else next();
}, function(req, res) {
  res.type('application/javascript').send(bundlejs);
});

app.use(express.static(__dirname + '/static'));
app.use('/vendor/webxray',
        express.static(__dirname + '/webxray-master/static-files'));
app.use('/vendor/webxray/src',
        express.static(__dirname + '/webxray-master/src'));

app.use(function(err, req, res, next) {
  console.log(err.stack);

  return res.type("text/plain").status(500).send(err.stack);
});

app.listen(PORT, function() {
  console.log("listening on port " + PORT);
});
