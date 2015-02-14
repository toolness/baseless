var fs = require('fs');
var urlModule = require('url');
var util = require('util');
var EventEmitter = require('events').EventEmitter;
var crypto = require('crypto');
var mime = require('mime');
var request = require('request');
var async = require('async');
var mkdirp = require('mkdirp');

var CACHE_DIR = __dirname + '/../cache';
var MAX_FILENAME_LEN = 80;

var urlQueues = {};

function CachedRequest(url) {
  var parsed = urlModule.parse(url);
  var filename = parsed.pathname.slice(1).replace(/\//g, '_');
  var hash = crypto.createHash('md5');

  this.url = url;

  filename = encodeURIComponent(filename);
  if (filename.length > MAX_FILENAME_LEN)
    filename = filename.slice(0, MAX_FILENAME_LEN);
  hash.update(url);
  this.key = parsed.hostname + '/' + filename + '-' + hash.digest('hex');
  this.keyPath = CACHE_DIR + '/' + this.key + '.json';
  this.keyDir = CACHE_DIR + '/' + parsed.hostname;
}

util.inherits(CachedRequest, EventEmitter);

CachedRequest.prototype.isResponseCached = function() {
  return fs.existsSync(this.keyPath);
};

CachedRequest.prototype.getCachedResponseMetadata = function() {
  return JSON.parse(fs.readFileSync(this.keyPath));
};

CachedRequest.prototype.cacheResponse = function(cb) {
  var url = this.url;
  var key = this.key;
  var keyPath = this.keyPath;

  var proxyReq = request.get({
    url: url,
    followRedirect: false
  });

  mkdirp.sync(this.keyDir);

  proxyReq.on('response', function(proxyRes) {
    var type = proxyRes.headers['content-type'] ||
               'application/octet-stream';
    var ext = mime.extension(type);
    var filename = key + '.c.' + ext;
    var contentPath = CACHE_DIR + '/' + filename;

    fs.writeFileSync(keyPath, JSON.stringify({
      url: url,
      statusCode: proxyRes.statusCode,
      headers: proxyRes.headers,
      filename: filename
    }, null, 2));

    proxyRes.pipe(fs.createWriteStream(contentPath))
      .on('close', function() {
        cb(null);
      }).on('error', cb);
  }).on('error', cb);

  return proxyReq;
};

CachedRequest.prototype.sendResponse = function(wasAlreadyCached) {
  var metadata = JSON.parse(fs.readFileSync(this.keyPath));
  var contentPath = CACHE_DIR + '/' + metadata.filename;
  var response = fs.createReadStream(contentPath);
  response.statusCode = metadata.statusCode;
  response.headers = metadata.headers;
  response.wasAlreadyCached = wasAlreadyCached;
  this.emit('response', response);
};

function respond(req, cb) {
  if (req.isResponseCached()) {
    req.sendResponse(true);
    cb(null);
  } else {
    req.cacheResponse(function(err) {
      cb(null);
      if (err)
        return req.emit('error', err);
      req.sendResponse(false);
    });
  }
}

function get(url) {
  var req = new CachedRequest(url);

  if (!(url in urlQueues)) {
    urlQueues[url] = async.queue(respond, 1);
    urlQueues[url].drain = function() {
      delete urlQueues[url];
    };
  }

  urlQueues[url].push(req);

  return req;
}

exports.CachedRequest = CachedRequest;
exports.get = get;
