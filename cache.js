var async     = require('async');
var crypto    = require('crypto');
var GitHubApi = require('github');
var leveldb   = require('level');
var lodash    = require('lodash');
var util      = require('util');
var debug     = require('debug')('github-cache:debug');

/**
 * Copyright 2014-2015
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

  async.eachSeries(apis, function(api, api_callback) {
    var raw_api_name = api;
    api = toCamelCase(api);

    var keys = Object.keys(self[self.version].routes[raw_api_name]);

    async.eachSeries(keys, function(key, key_callback) {
      var raw_key_name = key
      key = toCamelCase(key);

      self[api]['_' + key] = self[api][key];

      self[api][key] = function(options, fun_callback) {
        if (typeof(fun_callback) != 'function') fun_callback = function() {};
        
        var allowed_options = Object.keys(self[self.version].routes[raw_api_name][raw_key_name].params).map(function(p) {
          return p.replace('$','');
        });

        default_opts = lodash.merge({cache: true, validateCache: true}, lodash.pick(global_options, ['validateCache', 'cache']));
        options = lodash.merge(default_opts, options);
        debug('API: %s, Function: %s, Options: %j', api, key, options);

        self.getCache(raw_api_name, raw_key_name, options, function(err, cached_etag, cached_data) {
          if (err) return fun_callback(err);

          if (cached_etag && options.cache == true)
            options = lodash.merge({headers: {'if-none-match': cached_etag}}, options);

          if (options.validateCache == false && typeof(cached_data) != "undefined") {
            debug('ValidateCache is False, Cached Results Returned, API: %s, Function: %s', api, key);
            cached_data.meta = { cached: true, validatedCache: false };
            return fun_callback(null, cached_data);
          }

          var opts = lodash.pick(options, allowed_options.concat(['headers']));
          debug('Options: %j', opts)
          self[api]['_' + key](opts, function(err, results) {
            if (err) return fun_callback(err);

            if (options.cache == false)
              return fun_callback(null, results);

            if (results.meta.status == '304 Not Modified') {
              cached_data.meta = results.meta;
              cached_data.meta.cached = true;
              cached_data.meta.validatedCached = true;
              return fun_callback(null, cached_data);
            }

            self.putCache(raw_api_name, raw_key_name, options, results, function(err, data) {
              if (err) return fun_callback(err);
              fun_callback(null, data);
            });
          });
        })
      };

      key_callback(null);
    }, function(err) {
      if (err) return api_callback(err);
      api_callback();
    })
  }, function(err) {
    if (err) throw Error(err);
  });

  this.config.cachedb = this.config.cachedb || './cachedb';
  if (typeof(this.config.cachedb.db) != 'undefined') {
    this.cachedb = this.config.cachedb;
  } else {
    this.cachedb = leveldb(this.config.cachedb || './cachedb');
  }
};

util.inherits(GitHubCache, GitHubApi);

GitHubCache.prototype.getCache = function(api, fun, options, callback) {
  var self = this;
  var cache_id = self.cacheId(api, fun, options);
  
  self.cachedb.get(cache_id + ':tag', {valueEncoding: 'utf8'}, function(err, tag) {
    if (err && err.status != '404') return callback(err);
    self.cachedb.get('etag!' + tag, {valueEncoding: 'json'}, function(err, data) {
      if (err && err.status != '404') return callback(err);
      callback(null, tag, data);
    });
  });
};

GitHubCache.prototype.putCache = function(api, fun, options, cache_data, callback) {
  var self = this;
  
  var method = self[self.version].routes[api][fun].method;

  if (method == 'POST') // Do Not Cache On Creates
    return callback(null, cache_data);

  if (method == 'DELETE') { // If Delete Clear Affected Cache Keys
    return self.deleteCache(api, fun, options, function(err) {
      if (err) return callback(err);
      callback(null, cache_data);
    });
  }

  if (typeof(cache_data.meta.etag) == 'undefined')
    return callback(null);

  var cache_data_meta = cache_data.meta;
  delete cache_data.meta;

  var cache_id = self.cacheId(api, fun, options);    

  var ops = [
    { type: 'put', key: cache_id + ':tag',  value: cache_data_meta.etag, keyEncoding: 'utf8', valueEncoding: 'utf8' },
    { type: 'put', key: cache_id + ':meta', value: cache_data_meta, keyEncoding: 'utf8', valueEncoding: 'json' },
    { type: 'put', key: 'etag!' + cache_data_meta.etag, value: cache_data, keyEncoding: 'utf8', valueEncoding: 'json' },
    { type: 'put', key: 'etag!' + cache_data_meta.etag + '!cache_id!' + cache_id, value: cache_id, keyEncoding: 'utf8', valueEncoding: 'utf8' }
  ];

  self.cachedb.batch(ops, function(err) {
    if (err) return callback(err);
    cache_data.meta = cache_data_meta;
    callback(null, cache_data);
  });
};

GitHubCache.prototype.deleteCache = function(api, fun, options, callback) {
  var self = this;

  var cache_id = self.cacheId(api, fun, options);

  self.cachedb.get(cache_id + ':tag', function(err, etag) {
    if (err && err.status != 404) return callback(err);

    var ops = [
      { type: 'del', key: cache_id + ':tag' },
      { type: 'del', key: cache_id + ':meta' },
    ];

    if (!err) {
      ops.push({ type: 'del', key: 'etag!' + etag })
      ops.push({ type: 'del', key: 'etag!' + etag + '!cache_id!' + cache_id });
    }

    self.cachedb.batch(ops, function(err) {
      if (err) return callback(err);
      callback();
    });
  });
};

GitHubCache.prototype.cacheId = function(api, fun, options) {
  var self = this;
  
  var mappings = {
    'create': 'get',
    'delete': 'get',
    'update': 'get',
    'edit': 'get'
  };
  
  var allowed_options = Object.keys(self[self.version].routes[api][mappings[fun] || fun].params).map(function(p) {
    return p.replace('$','');
  });
  
  debug('cacheId allowed_options: %j', allowed_options);
  var options_key = lodash.pick(options, allowed_options);
  debug('cacheId api: %s, original: %s, function: %s, options: %j', api, fun, mappings[fun] || fun, options_key);
  var cache_id = util.format("%s:%s:%s", api, mappings[fun] || fun, crypto.createHash('sha1').update(JSON.stringify(options_key)).digest('hex'));
  debug('cacheId cid: %s', cache_id);
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
