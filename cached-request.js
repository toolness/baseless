var fs = require('fs');
var util = require('util');
var EventEmitter = require('events').EventEmitter;
var crypto = require('crypto');
var mime = require('mime');
var request = require('request');
var async = require('async');

var CACHE_DIR = __dirname + '/cache';
var MAX_KEY_LEN = 80;

if (!fs.existsSync(CACHE_DIR))
  fs.mkdirSync(CACHE_DIR);

var urlQueues = {};

function CachedRequest(url) {
  this.url = url;
  this.key = encodeURIComponent(url);
  if (this.key.length > MAX_KEY_LEN) {
    var hash = crypto.createHash('md5');
    hash.update(url);
    this.key = hash.digest('hex');
  }
  this.keyPath = CACHE_DIR + '/' + this.key + '.json';
}

util.inherits(CachedRequest, EventEmitter);

CachedRequest.prototype.isResponseCached = function() {
  return fs.existsSync(this.keyPath);
};

CachedRequest.prototype.cacheResponse = function(cb) {
  var url = this.url;
  var key = this.key;
  var keyPath = this.keyPath;

  var proxyReq = request.get(url);

  proxyReq.on('response', function(proxyRes) {
    var type = proxyRes.headers['content-type'] ||
               'application/octet-stream';
    var ext = mime.extension(type);
    var filename = key + '.content.' + ext;
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

CachedRequest.prototype.sendResponse = function() {
  var metadata = JSON.parse(fs.readFileSync(this.keyPath));
  var contentPath = CACHE_DIR + '/' + metadata.filename;
  var response = fs.createReadStream(contentPath);
  response.statusCode = metadata.statusCode;
  response.headers = metadata.headers;
  this.emit('response', response);
};

function respond(req, cb) {
  if (req.isResponseCached()) {
    req.sendResponse();
    cb(null);
  } else {
    req.cacheResponse(function(err) {
      cb(null);
      if (err)
        return req.emit('error', err);
      req.sendResponse();
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

exports.get = get;
