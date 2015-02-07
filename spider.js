var urlModule = require('url');
var util = require('util');
var stream = require('stream');
var _ = require('underscore');
var async = require('async');

var Proxifier = require('./proxifier');
var cachedRequest = require('./cached-request');

function FakeResponse() {
  stream.PassThrough.apply(this, arguments);
  this.on('pipe', function() {
    this.emit('doneSpidering');
  }.bind(this));
}

util.inherits(FakeResponse, stream.PassThrough);

FakeResponse.prototype.redirect = function(statusCode, url) {
  this.statusCode = statusCode;
  this.redirectURL = url;
  this.emit('doneSpidering');
  this.end();
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

FakeResponse.prototype.send = function(buffer) {
  this.emit('doneSpidering');
  this.end(buffer);
  return this;
};

function normalizeURL(url, baseURL) {
  if (baseURL) url = urlModule.resolve(baseURL, url);

  var urlObj = urlModule.parse(url);
  return urlModule.format(_.extend(urlObj, {
    hash: ''
  }));
}

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

  res.on('doneSpidering', function() {
    if (res.redirectURL)
      linkedResources.push({
        type: 'redirect',
        url: res.redirectURL,
        baseURL: url
      });
    cb(null, linkedResources);
  });

  proxifier.proxify(url, res, next);
  return res;
}

function spider(options, cb) {
  var MAX_SIMULTANEOUS_REQUESTS = 5;
  var visited = {};
  var queue = async.queue(function(task, cb) {
    console.log("retrieving " + task.url);
    visited[task.url] = true;
    var res = getLinkedResources(task.url, function(err, r) {
      if (err) return cb(err);
      r.forEach(function(info) {
        var url = normalizeURL(info.url, info.baseURL);
        var ttl = task.ttl;

        if (!/^https?:\/\//.test(url) ||
            (url in visited) ||
            (info.type == 'html' && info.nodeName == 'script')) {
          return;
        }
        if (info.type == 'html' && info.nodeName == 'a') {
          if (options.linkPrefix && url.indexOf(options.linkPrefix) != 0)
            return;
          ttl--;
        }
        if (ttl < 0) return;
        queue.push({
          url: url,
          ttl: ttl
        });
        visited[url] = true;
      });
      cb(null);
    });
    res.on('data', function() { /* Just drain the stream. */ });
  }, MAX_SIMULTANEOUS_REQUESTS);

  queue.drain = cb;

  queue.push({
    url: normalizeURL(options.url),
    ttl: options.ttl
  });
}

function main() {
  spider({
    url: 'https://docs.djangoproject.com/en/1.7/',
    linkPrefix: 'https://docs.djangoproject.com/en/1.7/',
    ttl: 3
  }, function(err) {
    if (err) throw err;
    console.log("done");
  });
}

if (!module.parent)
  main();
