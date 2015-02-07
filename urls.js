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
