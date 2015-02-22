var http = require('http');
var urlModule = require('url');
var bodyParser = require('body-parser');
var WebSocketServer = require('ws').Server;
var express = require('express');
var basicAuth = require('basic-auth');
var browserify = require('browserify');
var archiver = require('archiver');
var mkdirp = require('mkdirp');
var hostnames = require('./lib/hostnames');
var urls = require('./lib/urls');
var webxray = require('./lib/webxray');
var Proxifier = require('./lib/proxifier');
var cachedRequest = require('./lib/cached-request');
var spider = require('./lib/spider');
var exportStaticFiles = require('./lib/static-export');
var diagnostics = require('./lib/diagnostics');

var PORT = process.env.PORT || 3000;
var DEBUG = 'DEBUG' in process.env;
var USERPASS = (process.env.USERPASS || '').split(':');

var bundlejs;
var server;
var webSocketServer;
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

app.get('/d/ping/:character', diagnostics.pingCharacter);

app.use('/proxy', function(req, res, next) {
  res.set('Content-Security-Policy', [
    "default-src 'self' data:",
    "script-src 'self'",
    "style-src 'unsafe-inline' 'self'"
  ].join('; '));
  next();
});

app.get('/proxy', function(req, res, next) {
  if (!/^https?:\/\/.+/.test(req.query.url))
    return res.status(400)
      .send("Please provide a proper URL.");

  return proxifier.proxify(req.query.url, res, next);
});

app.get('/proxy/submit', function(req, res, next) {
  var url = proxifier.getFormSubmitRedirect(req);

  if (!url) return res.sendStatus(400);
  return res.redirect('/proxy?url=' + encodeURIComponent(url));
});

app.get('/js/ipconfig.js', function(req, res, next) {
  hostnames.get(function(hostnames) {
    var js = 'var IPCONFIG = ' + JSON.stringify({
      port: PORT,
      hostnames: hostnames
    }, null, 2) + ';';
    res.type('application/javascript').send(js);
  });
});

app.get('/js/bundle.js', function(req, res, next) {
  if (!bundlejs || DEBUG) {
    var b = browserify();
    b.require('url');
    b.require('querystring');
    b.require('underscore');
    b.require('./lib/urls');
    b.bundle(function(err, buf) {
      if (err) return next(err);
      bundlejs = buf;
      next();
    });
  } else next();
}, function(req, res) {
  res.type('application/javascript').send(bundlejs);
});

app.get('/archive/zip', function(req, res, next) {
  var url = req.query.url;
  var urlObj = urlModule.parse(url);
  var ttl = parseInt(req.query.ttl);
  var linkPrefix = req.query.linkPrefix;
  var arch;

  if (!(/^https?:/.test(url) && ttl >= 0))
    return res.sendStatus(400);

  arch = archiver.create('zip');
  res.type('application/zip');
  res.set('Content-Disposition',
          'attachment; filename=' + urlObj.hostname + '.zip;');
  arch.pipe(res);
  exportStaticFiles({
    archiver: arch,
    rootDir: urlObj.hostname + '/',
    url: url,
    ttl: ttl,
    linkPrefix: linkPrefix
  });
});

app.post('/webxray/publish', bodyParser.urlencoded({
  extended: false,
  limit: 2 * 1024 * 1024
}), webxray.publish.bind(null, {
  rootDir: __dirname + '/webxray-makes',
  rootURL: '/makes/goggles/'
}));

app.use(express.static(__dirname + '/static'));

mkdirp.sync(__dirname + '/webxray-makes');
app.use('/makes/goggles', express.static(__dirname + '/webxray-makes'));

app.use(function(err, req, res, next) {
  console.log(err.stack);

  return res.type("text/plain").status(500).send(err.stack);
});

server = http.createServer(app);

server.listen(PORT, function() {
  console.log("listening on port " + PORT);
});

webSocketServer = new WebSocketServer({server: server});

webSocketServer.on('connection', function(ws) {
  var path = ws.upgradeReq.url;

  if (path == '/spider') {
    spider.handleWebSocketConnection(ws);
  } else if (path == '/d/traceroute') {
    diagnostics.traceroute(ws);
  } else if (path == '/d/ping') {
    diagnostics.ping(ws);
  }
});
