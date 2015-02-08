var fs = require('fs');
var path = require('path');
var mkdirp = require('mkdirp');

function entryInfo(options, i) {
  i = i.toString();
  return {
    dir: path.join(options.rootDir, i),
    metadata: path.join(options.rootDir, i, 'metadata.json'),
    html: path.join(options.rootDir, i, 'index.html'),
    htmlURL: options.rootURL + i + '/'
  };
}

exports.publish = function(options, req, res, next) {
  var entry;
  var i = 1;

  while (true) {
    entry = entryInfo(options, i);
    if (!fs.existsSync(entry.metadata))
      break;
    i++;
  }

  mkdirp.sync(entry.dir);
  fs.writeFileSync(entry.metadata, JSON.stringify({
    'original-url': req.body['original-url']
  }));
  fs.writeFileSync(entry.html, req.body['html']);

  return res.send({'published-url': entry.htmlURL});
};
