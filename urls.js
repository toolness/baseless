var urlModule = require('url');

exports.rewriteURL = function(url) {
  return '/proxy?url=' + encodeURIComponent(url);
};

exports.extractURL = function(url) {
  var info = urlModule.parse(url, true);
  return info.query.url;
};
