var fs = require('fs');
var urlModule = require('url');
var util = require('util');
var EventEmitter = require('events').EventEmitter;
var path = require('path');
var _ = require('underscore');
var mkdirp = require('mkdirp');
var archiver = require('archiver');

var spider = require('./spider');
var cachedRequest = require('./cached-request');
var Proxifier = require('./proxifier');

var posixPath = path.posix;

if (!posixPath)
  throw new Error('path.posix is undefined, you may need Node v0.12!');

function StaticAssetMap(rootDir) {
  this.rootDir = rootDir || '';
  this.filenames = {};
  this._indexFound = false;
}

StaticAssetMap.prototype._isRedirect = function(meta) {
  return (meta.statusCode > 300 && meta.statusCode < 304 &&
          meta.headers.location);
};

StaticAssetMap.prototype.isRedirect = function(url) {
  var req = new cachedRequest.CachedRequest(url);

  return this._isRedirect(req.getCachedResponseMetadata());
};

StaticAssetMap.prototype._cacheFilenameFor = function(url) {
  var req = new cachedRequest.CachedRequest(url);
  if (!req.isResponseCached()) return null;

  var meta = req.getCachedResponseMetadata();

  if (this._isRedirect(meta)) {
    return this.filenameFor(urlModule.resolve(url, meta.headers.location));
  }

  if (meta.statusCode == 200) {
    if (!this._indexFound) {
      this._indexFound = true;
      return this.rootDir + 'index' + posixPath.extname(meta.filename);
    }
    return this.rootDir + meta.filename;
  }

  return null;
};

StaticAssetMap.prototype.filenameFor = function(url) {
  if (!(url in this.filenames))
    this.filenames[url] = this._cacheFilenameFor(url);

  return this.filenames[url];
};

function FilesystemArchiver(rootDir) {
  EventEmitter.apply(this);
  this.rootDir = rootDir;
}

util.inherits(FilesystemArchiver, EventEmitter);

FilesystemArchiver.prototype.append = function(stream, options) {
  var filename = options.name;
  var fullPath = path.normalize(path.join(this.rootDir, filename));
  var dirname = path.dirname(fullPath);

  mkdirp.sync(dirname);
  stream.pipe(fs.createWriteStream(fullPath));
};

FilesystemArchiver.prototype.finalize = function() {
  process.nextTick(this.emit.bind(this, 'finalize'));
};

function exportStaticFiles(options) {
  var self = new EventEmitter();
  var assetMap = new StaticAssetMap(options.rootDir);
  var proxifier = new Proxifier({
    rewriteURL: function(url, fromURL, type) {
      if (type == 'redirect') return url;

      var fromFilename = assetMap.filenameFor(fromURL);
      var toFilename = assetMap.filenameFor(url);

      if (!fromFilename || !toFilename) return url;

      var fromDir = posixPath.dirname(fromFilename);
      var toDir = posixPath.dirname(toFilename);
      var relPath = posixPath.relative(fromDir, toDir);

      if (relPath) relPath += '/';
      relPath += posixPath.basename(toFilename);

      return relPath;
    },
    formSubmitURL: '',
    request: cachedRequest
  });
  var spiderOptions = _.extend({
    proxifier: proxifier
  }, _.pick(options, 'url', 'linkPrefix', 'ttl'));

  spider(spiderOptions).on('response', function(res) {
    var req = new cachedRequest.CachedRequest(res.url);
    var drainResponse = function() {
      res.on('data', function() { /* Just drain the stream. */ });
    };

    if (!req.isResponseCached()) {
      self.emit('warning', "no cached response for " + res.url);
      return drainResponse();
    }

    var filename = assetMap.filenameFor(res.url);

    if (!filename) {
      self.emit('warning', "no filename for " + res.url);
      return drainResponse();
    }

    if (assetMap.isRedirect(res.url))
      return drainResponse();

    self.emit('append', {
      url: res.url,
      stream: res,
      filename: filename
    });
    options.archiver.append(res, {name: filename});
  }).on('error', function(err) {
    self.emit('error', err);
  }).on('end', function() {
    options.archiver.finalize();
    self.emit('end');
  });

  return self;
}

function main(archiveType) {
  var indexURL = 'https://docs.djangoproject.com/en/1.7/';
  var arch;

  if (archiveType == 'zip') {
    arch = archiver.create('zip');
    arch.pipe(fs.createWriteStream('archive.zip'))
      .on('close', function() {
        console.log("done writing archive.zip");
      });
  } else if (archiveType == 'fs') {
    arch = new FilesystemArchiver(__dirname + '/../build');
    arch.on('finalize', function() {
      console.log("done writing to build/");
    });
  } else {
    throw new Error('unknown archive type: ' + archiveType);
  }

  exportStaticFiles({
    archiver: arch,
    url: indexURL,
    linkPrefix: indexURL,
    ttl: 0
  }).on('warning', function(message) {
    console.log("WARNING: " + message);
  }).on('end', function() {
    console.log("done spidering");
  });
}

module.exports = exportStaticFiles;
module.exports.FilesystemArchiver = FilesystemArchiver;

if (!module.parent)
  main(process.argv[2] || 'zip');
