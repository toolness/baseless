var urlModule = require('url');
var _ = require('underscore');

exports.rewriteURL = function(url) {
  var urlObj = urlModule.parse(url);
  var hash = urlObj.hash || '';

  url = urlModule.format(_.omit(urlObj, 'hash'));
  return '/proxy?url=' + encodeURIComponent(url) + hash;
};

exports.extractURL = function(url) {
  var urlObj = urlModule.parse(url, true);
  return urlObj.query.url + (urlObj.hash || '');
};

exports.isSameServerURL = function(a, b) {
  var aObj = urlModule.parse(a);
  var bObj = urlModule.parse(b);

  a = urlModule.format(_.omit(aObj, 'hash'));
  b = urlModule.format(_.omit(bObj, 'hash'));

  return a == b;
};

exports.getHash = function(url) {
  return urlModule.parse(url).hash || '';
};
