var fs = require('fs');
var request = require('request');

var URL = process.argv[2];
var OUTPUTFILE = process.argv[3];

if (!URL || !OUTPUTFILE) throw new Error('not enough args');

request.get(URL).pipe(fs.createWriteStream(OUTPUTFILE));
