var tap = require('tap');
var test = tap.test;
var async = require('async');
var rimraf = require('rimraf').sync;

var GitHubCache = require('./cache.js');

rimraf('./testcachedb');

var ghc = new GitHubCache({
  version: '3.0.0',
  cachedb: './testcachedb',
});

ghc.authenticate({
  type: 'oauth',
  token: process.env.GHTOKEN
});

var gist_id = '';

test('create gist', function(t) {
  ghc.gists.create({
    public: false,
    files: {
      'test.js': {
        content: 'testing'
      }
    }
  }, function(err, gist) {
    t.ok(!err, 'there should be no error creating the gist');
    
    gist_id = gist.id;
    
    var count = 0;
    ghc.cachedb.createReadStream()
      .on('data', function(data) {
        count++;
      })
      .on('end', function() {
        t.equal(count, 0)
        t.end();
      })
  });
});

test('get gist #1 -- should be retrieved from github', function(t) {
  ghc.gists.get({
    id: gist_id
  }, function(err, gist) {
    t.ok(!err, 'there should be no error retrieving the gist');
    t.equal(gist.meta.status, '200 OK')
    t.end();
  })
})

test('get gist #2 -- should be retrieved from cache, etag verified with github', function(t) {
  ghc.gists.get({
    id: gist_id
  }, function(err, gist) {
    t.ok(!err, 'there should be no eror retrieving the gist');
    t.equal(gist.meta.status, '304 Not Modified');
    t.equal(gist.meta.cached, true);
    t.end();
  })
})

test('get gist #3 -- should be retrieved from cached, no etag verification', function(t) {
  ghc.gists.get({
    id: gist_id,
    validateCache: false
  }, function(err, gist) {
    t.ok(!err, 'there should be no error retrieving the gist')
    t.equal(gist.meta.cached, true, 'should be pulled from cache');
    t.equal(gist.meta.validatedCache, false, 'no verification of cached data');
    t.end();
  });
})

test('delete gist', function(t) {
  ghc.gists.delete({
    id: gist_id
  }, function(err) {
    t.ok(!err, 'there should be no error deleting the gist');

    var count = 0;
    ghc.cachedb.createReadStream()
      .on('data', function(data) {
        count++;
      })
      .on('end', function() {
        t.equal(count, 0, 'there should be no more keys')
        t.end();
      })
  });
});

