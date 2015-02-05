var express = require('express');
var Proxifier = require('./proxifier');
var cachedRequest = require('./cached-request');

var PORT = process.env.PORT || 3000;
var app = express();
var proxifier = new Proxifier({
  rewriteURL: function(url) {
    return '/proxy?url=' + encodeURIComponent(url);
  },
  formSubmitURL: '/proxy/submit',
  request: cachedRequest
});

app.use('/proxy', function(req, res, next) {
  res.set('Content-Security-Policy', [
    "default-src 'self' data:",
    "script-src 'none'",
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
  return proxifier.proxifyFormSubmission(req, res, next);
});

app.use(express.static(__dirname + '/static'));

app.listen(PORT, function() {
  console.log("listening on port " + PORT);
});
