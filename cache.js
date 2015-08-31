var crypto    = require('crypto');
var GitHubApi = require('github');
var leveldb   = require('level');
var lodash    = require('lodash');
var util      = require('util');
var debug     = require('debug')('github-cache');

/**
 * Copyright 2014
 * Author: Erik Kristensen <erik@erikkristensen.com>
 *
 * GitHubCache is a transparent caching layer for node-github.
 * It overloads all API functions and introduces a caching mechanism.
 * You can call all the original functions by using an underscore in
 * front of their original function name.
 */
var GitHubCache = module.exports = function(global_options) {
  GitHubCache.super_.call(this, global_options);

  var apis = Object.keys(this[this.version].routes);

  var self = this;
  self.prefix = global_options.prefix || '';
  self.separator = global_options.separator || ':';

  if (self.prefix != '') {
    self.prefix += self.separator
  }

  apis.forEach(function(api) {
    api = toCamelCase(api);
    debug('loading api: %s', api)
    var keys = Object.keys(self[api]);

    keys.forEach(function(key) {
      debug('loading api: %s, function: %s', api, key)
      self[api]['_' + key] = self[api][key];

      self[api][key] = function(options, fun_callback) {
        var cache_id = self.cacheId(api, key, options);
        debug('api: %s, key: %s, id: %s, options: %j', api, key, cache_id, options)

        default_opts = lodash.merge({cache: true, validateCache: true}, lodash.pick(global_options, ['validateCache', 'cache']));
        options = lodash.merge(default_opts, options);

        self.getCache(cache_id, function(err, cached_etag, cached_data) {
          debug('pre-options: %j', options)
          debug('cached etag: %s', cached_etag)
          if (cached_etag && options.cache == true)
            options = lodash.merge({headers: {'If-None-Match': cached_etag}}, options);

          debug('post-options: %j', options)
          if (options.validateCache == false && typeof(cached_data) != "undefined") {
            return fun_callback(null, cached_data);
          }

          var opts = lodash.omit(options, ['cache', 'validateCache', 'invalidateCache']);
          self[api]['_' + key](opts, function(err, results) {
            if (err) return fun_callback(err);

            if (typeof(options.invalidateCache) != 'undefined')
              self.invalidateCache(options.invalidateCache, opts);

            if (options.cache == false)
              return fun_callback(null, results);

            if (results.meta.status == '304 Not Modified')
              return fun_callback(null, cached_data);

            self.putCache(cache_id, results, function(err) {
              if (err) return fun_callback(err);
              fun_callback(null, results);
            });
          });
        });
      };
    });
  });

  this.config.cachedb = this.config.cachedb || './cachedb';
  if (typeof(this.config.cachedb) == 'object' && typeof(this.config.cachedb.put) == 'function') {
    this.cachedb = this.config.cachedb;
  } else {
    this.cachedb = leveldb(this.config.cachedb || './cachedb');
  }
};

util.inherits(GitHubCache, GitHubApi);

GitHubCache.prototype.getCache = function(cache_id, callback) {
  var self = this;
  debug('getCache id: %s', cache_id)
  self.cachedb.get(cache_id + self.separator + 'tag', function(err, tag) {
    debug('getCache id: %s, tag: %s', (cache_id + self.separator + 'tag'), tag)
    if (err && err.status == '404') {
      return callback(null, false, undefined)
    }
    if (err) {
      debug('getCache error1: %j', err)
      return callback(err);
    }
    self.cachedb.get(cache_id + self.separator + 'data', function(err, data) {
      debug('getCache id: %s, data: %j', (cache_id + self.separator + 'data'), data)
      if (err && err.status == '404') {
        return callback(null, false, undefined)
      }
      if (err) {
        debug('getCache error1: %j', err)
        return callback(err);
      }

      var d = {}
      try {
        d = JSON.parse(data)
      } catch (e) {}

      callback(null, tag, d);
    });
  });
};

GitHubCache.prototype.putCache = function(cache_id, cache_data, callback) {
  var self = this;
  debug('putCache id: %s', cache_id)
  if (typeof(cache_data.meta.etag) == 'undefined') {
    debug('putCache - missing etag data')
    return callback(null);
  }

  self.cachedb.put(cache_id + self.separator + 'tag', cache_data.meta.etag, function(err) {
    debug('putCache id: %s, tag: %s', (cache_id + self.separator + 'tag'), cache_data.meta.etag)
    if (err) {
      debug('putCache id: %s, err: %j', (cache_id + self.separator + 'tag'), err)
      return callback(err);
    }

    self.cachedb.put(cache_id + self.separator + 'data', JSON.stringify(cache_data), function(err) {
      debug('putCache id: %s, data: %j', (cache_id + self.separator + 'data'), cache_data)
      if (err) {
        debug('putCache id: %s, err: %j', (cache_id + self.separator + 'data'), err)
        return callback(err);
      }

      callback(null);
    });
  });
};

GitHubCache.prototype.invalidateCache = function(invalidateOpts, options) {
  var self = this;
  var invalid = false;
  
  debug('invalidateCache @ opts: %j', invalidateOpts);

  ['api', 'fun', 'fields'].forEach(function(f) {
    if (typeof(invalidateOpts[f]) == 'undefined')
      invalid = true;
  })
  if (invalid == true) return;

  options = lodash.omit(options, ['invalidateCache', 'cache', 'validateCache', 'headers'])
  options = lodash.pick(options, invalidateOpts.fields);
  options = lodash.merge(options, {page: 0, per_page: 100});

  var cache_id = self.cacheId(invalidateOpts.api, invalidateOpts.fun, options);

  debug('invalidateCache @ invalid: %j, options: %j, id: %s', invalidateOpts, options, cache_id);
  
  var ops = [
    { type: 'del', key: self.prefix + cache_id + self.separator + 'tag' },
    { type: 'del', key: self.prefix + cache_id + self.separator + 'data' }
  ];
  
  self.cachedb.del(cache_id + ':tag', function(err) {
    if (err) debug('Error Invaliding Cache: %s', err);
    self.cachedb.del(cache_id + ':data', function(err) {
      if (err) debug('Error Invaliding Cache: %s', err);
    });
  });
};

GitHubCache.prototype.cacheId = function(api, fun, options) {
  var self = this;
  var options_key = lodash.omit(options, ['validateCache', 'cache', 'invalidateCache', 'headers']);
  var cache_id = util.format("%s%s%s%s%s%s", self.prefix, api, self.separator, fun, self.separator,  crypto.createHash('sha1').update(JSON.stringify(options_key)).digest('hex'));
  debug('cacheId - api: %s, function: %s, options: %j, id: %s', api, fun, options_key, cache_id);
  return cache_id;
};

// Borrowed from https://github.com/mikedeboer/node-github/blob/master/util.js
function toCamelCase(str, upper) {
  str = str.toLowerCase().replace(/(?:(^.)|(\s+.)|(-.))/g, function(match) {
    return match.charAt(match.length - 1).toUpperCase();
  });
  if (upper)
    return str;
  return str.charAt(0).toLowerCase() + str.substr(1);
};
