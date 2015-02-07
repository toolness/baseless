var fs = require('fs');
var urlModule = require('url');
var path = require('path');
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

function main() {
  var indexURL = 'https://docs.djangoproject.com/en/1.7/';
  var buildDir = __dirname + '/build';
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
    ttl: 1
  }).on('response', function(res) {
    var filename = assetMap.filenameFor(res.url);

    if (!filename) {
      console.log("WARNING NO FILENAME FOR", res.url);
      return;
    }

    if (assetMap.isRedirect(res.url))
      return;

    var fullPath = path.normalize(buildDir + '/' + filename);
    var dirname = path.dirname(fullPath);

    if (!fs.existsSync(dirname))
      fs.mkdirSync(dirname);

//    console.log(res.url, "->", filename);
    res.pipe(fs.createWriteStream(fullPath));
  }).on('end', function() {
    console.log("done");
  });  

  assetMap.filenames[indexURL] = 'index.html';

  if (!fs.existsSync(buildDir))
    fs.mkdirSync(buildDir);
}

if (!module.parent)
  main();
