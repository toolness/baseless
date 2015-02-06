var urlModule = require('url');
var util = require('util');
var stream = require('stream');
var async = require('async');

var Proxifier = require('./proxifier');
var cachedRequest = require('./cached-request');

function FakeResponse() {
  stream.Writable.apply(this, arguments);
  this.on('pipe', function() {
    this.emit('done');
  }.bind(this));
}

util.inherits(FakeResponse, stream.Writable);

FakeResponse.prototype.redirect = function(statusCode, url) {
  this.statusCode = statusCode;
  this.redirectURL = url;
  this.emit('done');
  return this;
};

FakeResponse.prototype.status = function(statusCode) {
  this.statusCode = statusCode;
  return this;
};

FakeResponse.prototype.type = function(contentType) {
  this.contentType = contentType;
  return this;
};

FakeResponse.prototype.send = function() {
  this.emit('done');
  return this;
};

FakeResponse.prototype._write = function(chunk, encoding, cb) {
  process.nextTick(cb);
};

function getLinkedResources(url, cb) {
  var linkedResources = [];
  var res = new FakeResponse();
  var next = function(err) {
    if (err) return cb(err);
  };
  var proxifier = new Proxifier({
    rewriteURL: function(url) { return url; },
    formSubmitURL: '/dummy',
    request: cachedRequest
  });

  res.on('linkedResource', function(info) {
    linkedResources.push(info);
  });

  res.on('done', function() {
    if (res.redirectURL)
      linkedResources.push({
        type: 'redirect',
        url: res.redirectURL,
        baseURL: url
      });
    cb(null, linkedResources);
  });

  proxifier.proxify(url, res, next);
}

function spider(initialURL, initialTTL, cb) {
  var MAX_SIMULTANEOUS_REQUESTS = 5;
  var visited = {};
  var queue = async.queue(function(task, cb) {
    console.log("retrieving " + task.url);
    getLinkedResources(task.url, function(err, r) {
      if (err) return cb(err);
      if (task.ttl > 0) {
        r.forEach(function(info) {
          var url = urlModule.resolve(info.baseURL, info.url);
          if (!/^https?:\/\//.test(url) ||
              (url in visited) ||
              (info.type == 'html' && info.nodeName == 'script')) {
            return;
          }
          queue.push({
            url: url,
            ttl: info.type == 'redirect' ? task.ttl : task.ttl - 1
          });
          visited[url] = true;
        });
      }
      cb(null);
    });
  }, MAX_SIMULTANEOUS_REQUESTS);

  queue.drain = cb;

  visited[initialURL] = true;
  queue.push({
    url: initialURL,
    ttl: initialTTL
  });
}

function main() {
  spider('https://docs.djangoproject.com/en/1.7/', 1, function(err) {
    if (err) throw err;
    console.log("done");
  });
}

if (!module.parent)
  main();
