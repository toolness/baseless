var urlModule = require('url');
var EventEmitter = require('events').EventEmitter;
var util = require('util');
var stream = require('stream');
var _ = require('underscore');
var async = require('async');

var HTTP_STATUS_CODES = require('http').STATUS_CODES;

var Proxifier = require('./proxifier');
var cachedRequest = require('./cached-request');

function FakeResponse(url) {
  stream.PassThrough.call(this);
  this.url = url;
  this.on('pipe', function() {
    if (!this.statusCode) this.statusCode = 200;
    if (!this.contentType) this.contentType = "text/html";
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
  if (!this.statusCode) this.statusCode = 200;
  if (!this.contentType) this.contentType = "text/html";
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

function getLinkedResources(url, proxifier, cb) {
  var linkedResources = [];
  var res = new FakeResponse(url);
  var next = function(err) {
    if (err) return cb(err);
  };

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

function SpiderError(url, err) {
  Error.call(this);
  this.message = "Spidering error: " + err.message;
  this.url = url;
  this.err = err;
}

util.inherits(SpiderError, Error);

function spider(options, cb) {
  var self = new EventEmitter();
  var MAX_SIMULTANEOUS_REQUESTS = 5;
  var visited = {};
  var proxifier = options.proxifier || new Proxifier({
    rewriteURL: function(url) { return url; },
    formSubmitURL: '/dummy',
    request: cachedRequest
  });
  var queue = async.queue(function(task, cb) {
    visited[task.url] = true;
    var res = getLinkedResources(task.url, proxifier, function(err, r) {
      if (err) {
        self.emit('error', new SpiderError(task.url, err));
        return cb(err);
      }
      r.forEach(function(info) {
        var url = normalizeURL(info.url, info.baseURL);
        var ttl = task.ttl;

        if (!/^https?:\/\//.test(url) ||
            (url in visited) ||
            (info.type == 'html' && info.nodeName == 'script') ||
            (info.type == 'html' && info.nodeName == 'link' &&
             info.relType != 'stylesheet')) {
          return;
        }
        if (info.type == 'html' && info.nodeName == 'a') {
          if (options.linkPrefix && url.indexOf(options.linkPrefix) != 0)
            return;
          ttl--;
        }
        if (ttl < 0) return;
        queue.push({
          referer: task.url,
          url: url,
          ttl: ttl
        });
        visited[url] = true;
      });
    });
    res.on('end', cb);
    res.referer = task.referer || null;
    self.emit('response', res);
  }, MAX_SIMULTANEOUS_REQUESTS);

  queue.drain = function() {
    self.emit('end');
  };

  queue.push({
    url: normalizeURL(options.url),
    ttl: options.ttl
  });
  self.kill = queue.kill.bind(queue);

  return self;
}

function handleWebSocketConnection(ws) {
  var spidering = null;
  var send = function(data) {
    ws.send(JSON.stringify(data), function(err) {
      if (err) console.log(err);
    });
  };

  var startSpidering = function(options) {
    spidering = spider(options);
    spidering.on('response', function(res) {
      var size = 0;
      res.on('doneSpidering', function() {
        send(_.extend({
          type: 'responseStart',
          status: HTTP_STATUS_CODES[res.statusCode]
        }, _.pick(res, 'contentType', 'statusCode', 'url', 'referer',
                       'redirectURL', 'wasAlreadyCached')));
      });
      res.on('end', function() {
        send({type: 'responseEnd', url: res.url, size: size});
      });
      res.on('data', function(chunk) { size += chunk.length; });
    }).on('error', function(err) {
      send({
        type: 'error',
        url: err.url,
        message: err.message
      });
    }).on('end', function() {
      spidering = null;
      send({
        type: 'end'
      });
    });
  };

  ws.on('message', function(data) {
    data = JSON.parse(data);
    if (data.type == 'spider' && !spidering) {
      startSpidering(data.options);
    }
  });

  ws.on('close', function() {
    if (spidering) {
      spidering.removeAllListeners().kill();
      spidering = null;
    }
  });
}

function main() {
  spider({
    url: 'https://docs.djangoproject.com/en/1.7/',
    linkPrefix: 'https://docs.djangoproject.com/en/1.7/',
    ttl: 3
  }).on('response', function(res) {
    console.log("retrieving " + res.url);
    res.on('data', function() { /* Just drain the stream. */ });
  }).on('end', function() {
    console.log("done");
  });
}

module.exports = spider;
module.exports.handleWebSocketConnection = handleWebSocketConnection;

if (!module.parent)
  main();
