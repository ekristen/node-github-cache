var test = require('tape')
var rimraf = require('rimraf')
var MemDB = require('memdb')
var GitHubCache = require('./cache.js')
var GitHubAPI = require('github')

var githubapi = new GitHubAPI({
  version: '3.0.0'
})

githubapi.authenticate({
  type: 'oauth',
  token: process.env.GHTOKEN
})

test('cache', function (t) {
  var dbpath = './testcachedb' + new Date().getTime()
  var dburi = 'level://localhost/' + dbpath

  var github = new GitHubCache(githubapi, {
    cachedb: {
      uri: dburi
    }
  })

  github.users.getFollowingForUser({
    username: 'ekristen'
  }, function (err, data1) {
    t.error(err, 'there should be no error')
    t.equal(data1.meta.status, '200 OK')

    github.users.getFollowingForUser({
      username: 'ekristen'
    }, function (err, data2) {
      t.error(err, 'there should be no error')
      t.equal(data2.meta.status, '304 Not Modified')
      rimraf(dbpath, t.end.bind(null))
    })
  })
})

test('do not cache', function (t) {
  var dbpath = './testcachedb' + new Date().getTime()
  var dburi = 'level://localhost/' + dbpath

  var github = new GitHubCache(githubapi, {
    cachedb: {
      uri: dburi
    }
  })

  github.users.getFollowingForUser({
    username: 'ekristen',
    cache: false
  }, function (err, data1) {
    t.error(err)
    t.equal(typeof data1.meta, 'object')

    var r1 = data1.meta['x-ratelimit-remaining']
    delete data1.meta

    github.users.getFollowingForUser({
      username: 'ekristen',
      cache: false
    }, function (err, data2) {
      t.error(err)
      t.equal(typeof data2.meta, 'object')

      var r2 = data2.meta['x-ratelimit-remaining']
      delete data2.meta

      t.ok(r2 < r1)

      rimraf(dbpath, t.end.bind(null))
    })
  })
})

test('do not validate cache', function (t) {
  var dbpath = './testcachedb' + new Date().getTime()
  var dburi = 'level://localhost/' + dbpath

  var github = new GitHubCache(githubapi, {
    cachedb: {
      uri: dburi
    }
  })

  github.users.getFollowingForUser({
    username: 'ekristen',
    validateCache: false
  }, function (err, data1) {
    t.error(err)
    var etag = data1.meta.etag
    t.equal(data1.meta.status, '200 OK')

    delete data1.meta

    github.users.getFollowingForUser({
      username: 'ekristen',
      validateCache: false
    }, function (err, data2) {
      t.error(err)
      t.equal(data2.meta.status, '304 Not Modified')
      t.equal(etag, data2.meta.etag)

      rimraf(dbpath, t.end.bind(null))
    })
  })
})

test('non-default options', function (t) {
  var dbpath = './testcachedb' + new Date().getTime()
  var dburi = 'level://localhost/' + dbpath

  var github = new GitHubCache(githubapi, {
    cachedb: {
      uri: dburi
    },
    prefix: 'cache',
    separator: ':'
  })

  github.users.getFollowingForUser({
    username: 'ekristen'
  }, function (err, data1) {
    t.error(err)
    t.equal(data1.meta.status, '200 OK')
    rimraf(dbpath, t.end.bind(null))
  })
})

test('custom cache instance using MemDB', function (t) {
  var github = new GitHubCache(githubapi, {
    cachedb: MemDB()
  })

  github.users.getFollowingForUser({
    username: 'ekristen'
  }, function (err, data1) {
    t.error(err, 'should not error')
    var etag = data1.meta.etag
    t.equal(data1.meta.status, '200 OK')

    delete data1.meta

    github.users.getFollowingForUser({
      username: 'ekristen'
    }, function (err, data2) {
      t.error(err, 'should not error')
      t.equal(data2.meta.status, '304 Not Modified')
      t.equal(etag, data2.meta.etag)

      t.end()
    })
  })
})
