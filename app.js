var fs = require('fs');
var Proxifier = require('./proxifier');
var express = require('express');

var PORT = process.env.PORT || 3000;
var app = express();
var proxifier = new Proxifier({
  rewriteURL: function(url) {
    return '/proxy?url=' + encodeURIComponent(url);
  }
});

app.get('/proxy', function(req, res, next) {
  if (!req.query.url)
    return res.status(400).send("url parameter required");

  res.set('Content-Security-Policy', [
    "default-src 'self' data:",
    "script-src 'none'",
    "style-src 'unsafe-inline' 'self'"
  ].join('; '));

  return proxifier.proxify(req.query.url, res, next);
});

app.get('/', function(req, res, next) {
  return fs.createReadStream(__dirname + '/index.html')
    .pipe(res.type('text/html'));
});

app.listen(PORT, function() {
  console.log("listening on port " + PORT);
});
