var fs = require('fs');
var urlModule = require('url');
var path = require('path');
var mkdirp = require('mkdirp');
var archiver = require('archiver');
var spider = require('./spider');
var cachedRequest = require('./cached-request');
var Proxifier = require('./proxifier');

var posixPath = path.posix;

if (!posixPath)
  throw new Error('path.posix is undefined, you may need Node v0.12!');

function StaticAssetMap() {
  this.filenames = {};
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
    return meta.filename;
  }

  return null;
};

StaticAssetMap.prototype.filenameFor = function(url) {
  if (!(url in this.filenames))
    this.filenames[url] = this._cacheFilenameFor(url);

  return this.filenames[url];
};

function FilesystemArchiver(rootDir) {
  this.rootDir = rootDir;
}

FilesystemArchiver.prototype.archive = function(filename, stream) {
  var fullPath = path.normalize(path.join(this.rootDir, filename));
  var dirname = path.dirname(fullPath);

  mkdirp.sync(dirname);
  return stream.pipe(fs.createWriteStream(fullPath));
};

FilesystemArchiver.prototype.finalize = function() {

};

function ArchiveFileArchiver(options) {
  this.options = options;
  this.archiver = archiver.create(options.format);
}

ArchiveFileArchiver.prototype.archive = function(filename, stream) {
  this.archiver.append(stream, {name: filename});
};

ArchiveFileArchiver.prototype.finalize = function(filename, stream) {
  this.archiver.finalize();
};

function main() {
  var indexURL = 'https://docs.djangoproject.com/en/1.7/';
  var arch = new ArchiveFileArchiver({
    format: 'zip'
  });
  var assetMap = new StaticAssetMap();
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

//      console.log(relPath);

      return relPath;
    },
    formSubmitURL: '',
    request: cachedRequest
  });
  spider({
    proxifier: proxifier,
    url: indexURL,
    linkPrefix: indexURL,
    ttl: 0
  }).on('response', function(res) {
    var req = new cachedRequest.CachedRequest(res.url);
    var drainResponse = function() {
      res.on('data', function() { /* Just drain the stream. */ });
    };

    if (!req.isResponseCached()) {
      console.log("WARNING NO CACHED RESPONSE FOR", res.url);
      return drainResponse();
    }

    var filename = assetMap.filenameFor(res.url);

    if (!filename) {
      console.log("WARNING NO FILENAME FOR", res.url);
      return drainResponse();
    }

    if (assetMap.isRedirect(res.url))
      return drainResponse();

    arch.archive(filename, res);

//    console.log(res.url, "->", filename);
  }).on('end', function() {
    arch.finalize();
    console.log("done spidering");
  });

  assetMap.filenames[indexURL] = 'index.html';

  arch.archiver.pipe(fs.createWriteStream('archive.zip'))
    .on('close', function() {
      console.log("done writing archive.zip");
    });
}

if (!module.parent)
  main();
