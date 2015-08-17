var test = require('tape');
var rimraf = require('rimraf');
var GitHubAPI = require('./cache.js');

test('cache', function(t) {
  
  var dbpath = './testcachedb' + new Date().getTime()
  
  var github = new GitHubAPI({
    version: "3.0.0",
    cachedb: dbpath,
  });
  
  github.authenticate({
    type: 'oauth',
    token: process.env.GHTOKEN
  });


  github.user.getFollowingFromUser({
    user: "ekristen",
  }, function(err, data1) {
    t.ok(!err)
    t.equal(typeof data1.meta, 'object')

    github.user.getFollowingFromUser({
      user: "ekristen",
    }, function(err, data2) {
      t.ok(!err)
      t.equal(typeof data2.meta, 'undefined')
      rimraf(dbpath, t.end.bind(null))
    });
  });
})

test('do not cache', function(t) {
  
  var dbpath = './testcachedb' + new Date().getTime()
  
  var github = new GitHubAPI({
    version: "3.0.0",
    cachedb: dbpath
  });
  
  github.authenticate({
    type: 'oauth',
    token: process.env.GHTOKEN
  });

  github.user.getFollowingFromUser({
    user: "ekristen",
    cache: false
  }, function(err, data1) {
    t.ok(!err)
    t.equal(typeof data1.meta, 'object')

    var r1 = data1.meta['x-ratelimit-remaining']
    delete data1.meta

    github.user.getFollowingFromUser({
      user: "ekristen",
      cache: false
    }, function(err, data2) {
      t.ok(!err)
      t.equal(typeof data2.meta, 'object')

      var r2 = data2.meta['x-ratelimit-remaining']
      delete data2.meta

      t.ok(r2 < r1)

      rimraf(dbpath, t.end.bind(null))
    });
  });
});


test('do not validate cache', function(t) {
  
  var dbpath = './testcachedb' + new Date().getTime()
  
  var github = new GitHubAPI({
    version: "3.0.0",
    cachedb: dbpath
  });
  
  github.authenticate({
    type: 'oauth',
    token: process.env.GHTOKEN
  });

  github.user.getFollowingFromUser({
    user: "ekristen",
  }, function(err, data1) {
    t.ok(!err)
    t.equal(typeof data1.meta, 'object')

    delete data1.meta

    github.user.getFollowingFromUser({
      user: "ekristen",
      validateCache: false
    }, function(err, data2) {
      t.ok(!err)
      t.equal(typeof data2.meta, 'undefined')

      rimraf(dbpath, t.end.bind(null))
    });
  });
});

