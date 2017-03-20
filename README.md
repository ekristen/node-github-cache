[![Build Status](https://travis-ci.org/ekristen/node-github-cache.svg)](https://travis-ci.org/ekristen/node-github-cache) [![Dependency Status](https://david-dm.org/ekristen/node-github-cache.svg)](https://david-dm.org/ekristen/node-github-cache) [![devDependency Status](https://david-dm.org/ekristen/node-github-cache/dev-status.svg)](https://david-dm.org/ekristen/node-github-cache#info=devDependencies) [![npm version](https://badge.fury.io/js/github-cache.svg)](http://badge.fury.io/js/github-cache)

# Caching Layer for Node-GitHub

[![Greenkeeper badge](https://badges.greenkeeper.io/ekristen/node-github-cache.svg)](https://greenkeeper.io/)

This is a Node.JS module that transparently adds caching for the [node-github](https://github.com/mikedeboer/node-github) project. This library makes use of [node-libkv](https://github.com/ekristen/node-libkv) for providing a consistent API layer for multiple different key/value storage backends.

By default if no `cachedb` is setup, a local leveldb instance will be created. 

[![NPM](https://nodei.co/npm/github-cache.png?downloads=true&downloadRank=true&stars=true)](https://nodei.co/npm/github-cache/)

## Changelog

### 2.0.0

* `github` is no longer a dependency of `github-cache`, this should allow this library to work with whatever version of `github` you need to work with now.
* You must instantiate an instance of `node-github` and then pass it into the constructor for the caching library.
* `github-cache` now uses `libkv` to provide access to key/value backends, the default still being leveldb
* The default separator is now `/`, this allows more key/value backends to be used by default


## Installation

Install with Node.JS package manager

```
$ npm install github-cache
```

## Documentation

You use this class just like you would use [node-github](https://github.com/mikedeboer/node-github). 

If you want to not use the cache at any time, add `cache: false` to your API call.

## Settings

1. `cachedb` - this is a value passed to the creation of the API object `Default: level:///./github-cachedb`
  - this can be a string in the format of a URI that is understood by libkv
  - this can be an object with a `uri` property as well as other options understood by libkv
  - this can be a custom cache object (explained below)
2. `cache` - this is a value that can be passed to any API function with a boolean value to disable or enable the cache. `Default: true`
3. `validateCache` - `Default: true` - Check cached etag using `If-None-Match` with GitHub API before using the cached data. Ensures you have the latest data at all times. Setting to `false` allows you to use cached data without making the API call, results in quicker lookups. Especially useful if you are making dozens of API calls or more.
4. `prefix` - `Default: ''` - this will prefix all keys in the key/value storage system
5. `separator` - `Default: /` - this will separate the various layers of key

## Example

### Using libkv + redis 

Redis must be running on the localhost in this example.

```javascript
var GitHubApi = require('github')
var GitHubCache = require('github-cache')

var github_api = new GitHubApi({
  version: '3.0.0',
  validateCache: true
})

var github = new GitHubCache(github_api, {
  cachedb: 'redis://'
})

github.user.getFollowingFromUser({
  user: 'ekristen',
  cache: false
}, function(err, res) {
  console.log(JSON.stringify(res))
})

github.orgs.getTeams({
  org: 'private',
  validateCache: false
}, function (err, teams) {
  console.log(teams)
})

```

### Using consul library directly

```javascript
var GitHubCache = require('github-cache')

var consul = require('consul')({
  host: '127.0.0.1'
})

// Need to make the set function available as `put` for the cache library to work.
consul.kv.put = consul.kv.set

// You will want to use a prefix and a `/` separator so that they keys get separated out better in consul.
var github_api = new GitHubAPI({
  version: '3.0.0'
})

var github = new GitHubCache({
  cachedb: consul.kv,
  prefix: 'github-cache',
  separator: '/'
})

github.authenticate({
  type: 'oauth',
  token: process.env.GHTOKEN
})

github.user.getFollowingFromUser({
  user: 'ekristen',
}, function (err, data) {
  console.log(data)
})

```

## Custom CacheDB Instance

You may pass in your own custom cachedb instance to `github-cache` to be valid and to work you will need the following function available: `put`, `get`, `del`, and `batch`. For more information see https://github.com/Level/levelup#api


