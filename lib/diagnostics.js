exports.pingCharacter = function(req, res, next) {
  var character = req.params['character'];
  var buf = new Buffer(1024 * 10);

  if (!/^[a-zA-Z0-9]$/.test(character))
    return next('route');

  buf.fill(character);
  res.set('Cache-Control', 'no-cache');
  res.type('text/plain').send(buf);
};
