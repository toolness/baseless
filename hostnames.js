var child_process = require('child_process');
var os = require('os');

var WIN32_IPCONFIG = 'C:\\Windows\\system32\\ipconfig.exe';
var WIN32_IP_REGEX = /IPv4 Address[\s.:]+([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)/;
var POSIX_IFCONFIG = '/sbin/ifconfig';
var POSIX_IP_REGEX = /inet[\sa-z:]+([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)/;

function getWin32(cb) {
  var hostnames = [];
  if (process.env.COMPUTERNAME)
    hostnames.push(process.env.COMPUTERNAME);

  child_process.exec(WIN32_IPCONFIG, function(err, stdout) {
    if (err) return cb(hostnames);
    stdout.split('\n').forEach(function(line) {
      var match = line.match(WIN32_IP_REGEX);
      if (match) hostnames.push(match[1]);
    });
    cb(hostnames);
  });
}

function getPosix(cb) {
  var hostnames = [os.hostname()];

  child_process.exec(POSIX_IFCONFIG, function(err, stdout) {
    if (err) return cb(hostnames);
    stdout.split('\n').forEach(function(line) {
      var match = line.match(POSIX_IP_REGEX);
      if (match) hostnames.push(match[1]);
    });
    cb(hostnames);
  });
}

function get(cb) {
  if (process.platform == 'win32')
    return getWin32(cb);
  return getPosix(cb);
}

exports.get = get;

if (!module.parent)
  get(function(info) {
    console.log(info);
  });
