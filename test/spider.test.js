var nock = require('nock');
var should = require('should');
var request = require('request');

var Proxifier = require('../lib/proxifier');
var spider = require('../lib/spider');

describe('spider', function() {
  var example;
  var proxifier;
  var log = [];
  var logResponse = function(res) {
    log.push({url: res.url});
    res.on('data', function() {});
  };

  beforeEach(function() {
    example = nock('http://example.org/');
    proxifier = new Proxifier({
      rewriteURL: function(url) { return url; },
      formSubmitURL: '/dummy',
      request: request
    });
  });
  afterEach(function() {
    example.done();
  });

  it('should work', function(done) {
    example
      .get('/')
      .reply(200, '<img src="boop.png">', {
        'Content-Type': 'text/html'
      })
      .get('/boop.png')
      .reply(200, 'hi');

    spider({
      url: 'http://example.org/',
      ttl: 3,
      proxifier: proxifier
    }).on('response', logResponse).on('end', function() {
      log.should.eql([{
        url: 'http://example.org/'
      }, {
        url: 'http://example.org/boop.png'
      }]);
      done();
    });
  });
});