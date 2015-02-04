var fs = require('fs');
var mime = require('mime');
var request = require('request');

var CACHE_DIR = __dirname + '/cache';

if (!fs.existsSync(CACHE_DIR))
  fs.mkdirSync(CACHE_DIR);

function getCachedEntry(keyPath) {

}

function cacheEntry(url, key, keyPath) {
  var proxyReq = request.get(url);

  proxyReq.on('response', function(proxyRes) {
    fs.writeFileSync(keyPath, JSON.stringify({
      statusCode: proxyRes.statusCode,
      headers: proxyRes.headers
    }, null, 2));

    var type = proxyRes.headers['content-type'] ||
               'application/octet-stream';
    var ext = mime.extension(type);

    var contentPath = CACHE_DIR + '/' + key + '.content.' + ext;

    proxyRes.pipe(fs.createWriteStream(contentPath))
      .on('close', function() {
        console.log("DONE WRITING", url);
      });
  });

  return proxyReq;
}

function get(url) {
  var key = encodeURIComponent(url);
  var keyPath = CACHE_DIR + '/' + key + '.json';

//  if (fs.existsSync(keyPath))
//    return getCachedEntry(keyPath);
  return cacheEntry(url, key, keyPath);
}

exports.get = get;
