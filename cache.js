var url = require('url')
var util = require('util')
var crypto = require('crypto')

var debug = require('debug')('github-cache')
var lodash = require('lodash')
var libkv = require('libkv')

function GitHubCache (GitHubAPI, options) {
  if (!(this instanceof GitHubCache)) {
    return new GitHubCache(GitHubAPI, options)
  }

  this.options = lodash.extend({
    prefix: '',
    separator: '/',
    cachedb: {
      uri: 'level:///./github-cachedb',
      valueOnly: true
    }
  }, options)

  this.api = GitHubAPI
  this.prefix = this.options.prefix
  this.separator = this.options.separator

  if (this.prefix !== '') {
    this.prefix += this.separator
  }

  this._validateGitHubAPI()
  this._setupApis()
  this._setupCacheDb()

  return this
}
module.exports = GitHubCache

GitHubCache.prototype._validateGitHubAPI = function GitHubCacheValidateGitHubAPI () {
  if (typeof this.api.config === 'undefined') {
    throw new Error('GitHubAPI does not appear to be valid')
  }
  if (typeof this.api.routes === 'undefined') {
    throw new Error('GitHubAPI does not appear to be valid')
  }
}

GitHubCache.prototype._setupApis = function GitHubCacheSetupAPIS () {
  var self = this

  var apis = Object.keys(self.api.routes)
  apis.forEach(function (api) {
    api = toCamelCase(api)
    debug('loading api: %s', api)
    var keys = Object.keys(self.api[api])

    if (typeof self[api] === 'undefined') {
      self[api] = {}
    }

    keys.forEach(function (key) {
      debug('loading api: %s, function: %s', api, key)
      // self[api]['_' + key] = self[api][key]

      self[api][key] = function (options, funCallback) {
        var cacheId = self.cacheId(api, key, options)
        debug('api: %s, key: %s, id: %s, options: %j', api, key, cacheId, options)

        var defaultOpts = lodash.merge({
          cache: true,
          validateCache: true
        }, lodash.pick(self.options, ['validateCache', 'cache']))
        options = lodash.merge(defaultOpts, options)

        self.getCache(cacheId, function (err, cachedEtag, cachedData) {
          debug('pre-options: %j', options)
          debug('cached etag: %s', cachedEtag)

          if (err && (!err.notFound && err.status !== 404)) {
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
          self.api[api][key](opts, function (err, results) {
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
}

GitHubCache.prototype._setupCacheDb = function GitHubCacheSetupCacheDB () {
  var uri = null
  if (typeof this.options.cachedb === 'string') {
    // We assume using libkv?
    uri = url.parse(this.options.cachedb)
    this.cachedb = libkv(uri.protocol.replace(/:/, ''), {
      uri: this.options.cachedb,
      valueOnly: true
    })
  } else if (typeof this.options.cachedb === 'object') {
    if (typeof this.options.cachedb.uri === 'string') {
      // Assume uri with options
      uri = url.parse(this.options.cachedb.uri)
      this.cachedb = libkv(uri.protocol.replace(/:/, ''), lodash.extend(this.options.cachedb, { valueOnly: true }))
    } else {
      if (typeof this.options.cachedb.put !== 'function') {
        throw new Error('Cache does not have the function PUT')
      }
      if (typeof this.options.cachedb.get !== 'function') {
        throw new Error('Cache does not have the function GET')
      }
      if (typeof this.options.cachedb.del !== 'function') {
        throw new Error('Cache does not have the function DEL')
      }
      if (typeof this.options.cachedb.batch !== 'function') {
        throw new Error('Cache does not have the function BATCH')
      }

      this.cachedb = this.options.cachedb
    }
  }
}

GitHubCache.prototype.getCache = function GitHubCacheGetCache (cacheId, callback) {
  var self = this
  debug('getCache id: %s', cacheId)

  self.cachedb.get(cacheId + self.separator + 'tag', function (err, tag) {
    debug('getCache id: %s, tag: %s', (cacheId + self.separator + 'tag'), tag)
    if (err && err.status === '404') {
      return callback(null, false, undefined)
    }

    if (err) {
      debug('getCache tag error: %j', err)
      return callback(err)
    }

    self.cachedb.get(cacheId + self.separator + 'meta', function (err, meta) {
      debug('getCache id: %s, meta: %j', (cacheId + self.separator + 'meta'), meta)
      if (err && err.status === '404') {
        return callback(null, false, undefined)
      }

      if (err) {
        debug('getCache meta error: %j', err)
        return callback(err)
      }

      var metaData = {}
      try {
        metaData = JSON.parse(meta)
      } catch (e) {
        debug('getCache meta json parse error: %j', err)
        return callback(e)
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
        } catch (e) {
          debug('getCache data parse error: %j', err)
          return callback(e)
        }

        d.meta = lodash.pick(metaData, ['link', 'etag', 'status'])
        d.meta.status = '304 Not Modified'

        callback(null, tag, d)
      })
    })
  })
}

GitHubCache.prototype.putCache = function GitHubCachePutCache (cacheId, cachedData, callback) {
  var self = this

  debug('putCache id: %s', cacheId)
  if (typeof cachedData.meta.etag === 'undefined') {
    debug('putCache - missing etag data')
    return callback(null)
  }

  var ops = [
    {
      type: 'put',
      key: cacheId + self.separator + 'tag',
      value: cachedData.meta.etag
    },
    {
      type: 'put',
      key: cacheId + self.separator + 'meta',
      value: JSON.stringify(cachedData.meta)
    },
    {
      type: 'put',
      key: cacheId + self.separator + 'data',
      value: JSON.stringify(cachedData)
    }
  ]

  debug('putCache ops: %j', ops)

  self.cachedb.batch(ops, function (err) {
    if (err) {
      if (err) {
        debug('putCache - err: %j', err)
        return callback(err)
      }
    }

    callback(null)
  })
}

GitHubCache.prototype.invalidateCache = function GitHubCacheInvalidateCache (invalidateOpts, options) {
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

GitHubCache.prototype.cacheId = function GitHubCacheCacheID (api, fun, options) {
  var self = this
  var optionsKey = lodash.omit(options, ['validateCache', 'cache', 'invalidateCache', 'headers'])
  var hash = crypto.createHash('sha1').update(JSON.stringify(optionsKey)).digest('hex')
  var cacheId = util.format('%s%s%s%s%s%s', self.prefix, api, self.separator, fun, self.separator, hash)
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
