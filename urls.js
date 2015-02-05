exports.rewriteURL = function(url) {
  return '/proxy?url=' + encodeURIComponent(url);
};
