var util = require('util')
var crypto = require('crypto')

var debug = require('debug')('github-cache')
var lodash = require('lodash')
var GitHubApi = require('github')

/**
 * Copyright 2014
 * Author: Erik Kristensen <erik@erikkristensen.com>
 *
 * GitHubCache is a transparent caching layer for node-github.
 * It overloads all API functions and introduces a caching mechanism.
 * You can call all the original functions by using an underscore in
 * front of their original function name.
 */
function GitHubCache (globalOptions) {
  GitHubCache.super_.call(this, globalOptions)

  var apis = Object.keys(this[this.version].routes)

  var self = this
  self.prefix = globalOptions.prefix || ''
  self.separator = globalOptions.separator || ':'

  if (self.prefix !== '') {
    self.prefix += self.separator
  }

  apis.forEach(function (api) {
    api = toCamelCase(api)
    debug('loading api: %s', api)
    var keys = Object.keys(self[api])

    keys.forEach(function (key) {
      debug('loading api: %s, function: %s', api, key)
      self[api]['_' + key] = self[api][key]

      self[api][key] = function (options, funCallback) {
        var cacheId = self.cacheId(api, key, options)
        debug('api: %s, key: %s, id: %s, options: %j', api, key, cacheId, options)

        var defaultOpts = lodash.merge({cache: true, validateCache: true}, lodash.pick(globalOptions, ['validateCache', 'cache']))
        options = lodash.merge(defaultOpts, options)

        self.getCache(cacheId, function (err, cachedEtag, cachedData) {
          debug('pre-options: %j', options)
          debug('cached etag: %s', cachedEtag)

          if (err && !err.notFound) {
            debug('getCache error: %j', err)
            return funCallback(err)
          }

          if (cachedEtag && options.cache === true) {
            options = lodash.merge({headers: {'If-None-Match': cachedEtag}}, options)
          }

          debug('post-options: %j', options)
          if (options.validateCache === false && typeof cachedData !== 'undefined') {
            return funCallback(null, cachedData)
          }

          var opts = lodash.omit(options, ['cache', 'validateCache', 'invalidateCache'])
          self[api]['_' + key](opts, function (err, results) {
            if (err) {
              return funCallback(err)
            }

            if (typeof options.invalidateCache !== 'undefined') {
              self.invalidateCache(options.invalidateCache, opts)
            }

            if (options.cache === false) {
              return funCallback(null, results)
            }

            if (results.meta.status === '304 Not Modified') {
              return funCallback(null, cachedData)
            }

            self.putCache(cacheId, results, function (err) {
              if (err) {
                return funCallback(err)
              }

              funCallback(null, results)
            })
          })
        })
      }
    })
  })

  this.config.cachedb = this.config.cachedb || './cachedb'
  if (typeof this.config.cachedb === 'object' && typeof this.config.cachedb.put === 'function') {
    this.cachedb = this.config.cachedb
  } else {
    var leveldb = require('level')

    this.cachedb = leveldb(this.config.cachedb || './cachedb')
  }
}
module.exports = GitHubCache

util.inherits(GitHubCache, GitHubApi)

GitHubCache.prototype.getCache = function (cacheId, callback) {
  var self = this
  debug('getCache id: %s', cacheId)
  self.cachedb.get(cacheId + self.separator + 'tag', function (err, tag) {
    debug('getCache id: %s, tag: %s', (cacheId + self.separator + 'tag'), tag)
    if (err && err.status === '404') {
      return callback(null, false, undefined)
    }
    if (err) {
      debug('getCache error1: %j', err)
      return callback(err)
    }
    self.cachedb.get(cacheId + self.separator + 'data', function (err, data) {
      debug('getCache id: %s, data: %j', (cacheId + self.separator + 'data'), data)
      if (err && err.status === '404') {
        return callback(null, false, undefined)
      }

      if (err) {
        debug('getCache error1: %j', err)
        return callback(err)
      }

      var d = {}
      try {
        d = JSON.parse(data)
      } catch (e) {}

      callback(null, tag, d)
    })
  })
}

GitHubCache.prototype.putCache = function (cacheId, cachedData, callback) {
  var self = this

  debug('putCache id: %s', cacheId)
  if (typeof cachedData.meta.etag === 'undefined') {
    debug('putCache - missing etag data')
    return callback(null)
  }

  self.cachedb.put(cacheId + self.separator + 'tag', cachedData.meta.etag, function (err) {
    debug('putCache id: %s, tag: %s', (cacheId + self.separator + 'tag'), cachedData.meta.etag)
    if (err) {
      debug('putCache id: %s, err: %j', (cacheId + self.separator + 'tag'), err)
      return callback(err)
    }

    self.cachedb.put(cacheId + self.separator + 'data', JSON.stringify(cachedData), function (err) {
      debug('putCache id: %s, data: %j', (cacheId + self.separator + 'data'), cachedData)
      if (err) {
        debug('putCache id: %s, err: %j', (cacheId + self.separator + 'data'), err)
        return callback(err)
      }

      callback(null)
    })
  })
}

GitHubCache.prototype.invalidateCache = function (invalidateOpts, options) {
  var self = this
  var invalid = false

  debug('invalidateCache @ opts: %j', invalidateOpts)

  var validOpts = ['api', 'fun', 'fields']
  validOpts.forEach(function (f) {
    if (typeof invalidateOpts[f] === 'undefined') {
      invalid = true
    }
  })

  if (invalid === true) {
    return
  }

  options = lodash.omit(options, ['invalidateCache', 'cache', 'validateCache', 'headers'])
  options = lodash.pick(options, invalidateOpts.fields)
  options = lodash.merge(options, {page: 0, per_page: 100})

  var cacheId = self.cacheId(invalidateOpts.api, invalidateOpts.fun, options)

  debug('invalidateCache @ invalid: %j, options: %j, id: %s', invalidateOpts, options, cacheId)

  var ops = [
    { type: 'del', key: self.prefix + cacheId + self.separator + 'tag' },
    { type: 'del', key: self.prefix + cacheId + self.separator + 'data' }
  ]

  self.cachedb.batch(ops, function (err) {
    if (err) {
      debug('Error Invaliding Cache: %s', err)
    }
  })
}

GitHubCache.prototype.cacheId = function (api, fun, options) {
  var self = this
  var optionsKey = lodash.omit(options, ['validateCache', 'cache', 'invalidateCache', 'headers'])
  var cacheId = util.format('%s%s%s%s%s%s', self.prefix, api, self.separator, fun, self.separator, crypto.createHash('sha1').update(JSON.stringify(optionsKey)).digest('hex'))
  debug('cacheId - api: %s, function: %s, options: %j, id: %s', api, fun, optionsKey, cacheId)
  return cacheId
}

// Borrowed from https://github.com/mikedeboer/node-github/blob/master/util.js
function toCamelCase (str, upper) {
  str = str.toLowerCase().replace(/(?:(^.)|(\s+.)|(-.))/g, function (match) {
    return match.charAt(match.length - 1).toUpperCase()
  })
  if (upper) {
    return str
  }
  return str.charAt(0).toLowerCase() + str.substr(1)
}
