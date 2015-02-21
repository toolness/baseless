var spawn = require('child_process').spawn;

var PING = 'ping';
var TRACEROUTE = process.platform == 'win32'
                 ? 'tracert'
                 : 'traceroute';

function normalizeAddr(ip) {
  var match = ip.match(/^::ffff:([0-9.]+)$/);
  if (match) return match[1];
  return ip;
}

function websocketProgram(program, ws) {
  var send = function(data) {
    ws.send(data, function(err) {
      if (err) console.log(err);
    });
  };
  var ip = ws.upgradeReq.connection.remoteAddress;
  var child = spawn(program, [normalizeAddr(ip)]);

  child.stdout.on('data', function(chunk) {
    send(chunk.toString());
  });

  child.stderr.on('data', function(chunk) {
    send(chunk.toString());
  });

  child.on('close', function() {
    child = null;
    ws.close();
  });

  child.on('error', function(e) {
    child = null;
    send("ERROR: " + e);
    ws.close();
  });

  ws.on('close', function() {
    if (child) {
      child.kill();
      child = null;
    }
  });
}

exports.pingCharacter = function(req, res, next) {
  var character = req.params['character'];
  var buf = new Buffer(1024 * 10);

  if (!/^[a-zA-Z0-9]$/.test(character))
    return next('route');

  buf.fill(character);
  res.set('Cache-Control', 'no-cache');
  res.type('text/plain').send(buf);
};

exports.traceroute = websocketProgram.bind(null, TRACEROUTE);
exports.ping = websocketProgram.bind(null, PING);
