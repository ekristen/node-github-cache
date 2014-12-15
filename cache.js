var async     = require('async');
var crypto    = require('crypto');
var GitHubApi = require('github');
var leveldb   = require('level');
var lodash    = require('lodash');
var util      = require('util');

var GitHubCache = module.exports = function(options) {
  GitHubCache.super_.call(this, options);

  var apis = ['issues', 'orgs', 'repos', 'user'];

  var self = this;

  async.eachSeries(apis, function(api, api_callback) {
    var keys = Object.keys(self[api]);

    async.eachSeries(keys, function(key, key_callback) {
      self[api]['_' + key] = self[api][key];

      self[api][key] = function(options, fun_callback) {
        var cache_id = util.format("%s:%s:%s", api, key, crypto.createHash('sha1').update(JSON.stringify(options)).digest('hex'));
        options = lodash.merge({cache: true}, options);

        self.getCache(cache_id, function(err, cached_etag, cached_data) {
          if (cached_etag && options.cache == true)
            options = lodash.merge({headers: {'If-None-Match': cached_etag}}, options);

          opts = lodash.omit(options, 'cache');
          self[api]['_' + key](opts, function(err, results) {
            if (err) return fun_callback(err);

            if (options.cache == false)
              return fun_callback(null, results);

            if (results.meta.status == '304 Not Modified')
              return fun_callback(null, cached_data);

            self.putCache(cache_id, results, function(err) {
              if (err) return fun_callback(err);
              return fun_callback(null, results);
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

  this.cachedb = leveldb(options.db || './cachedb');
};

util.inherits(GitHubCache, GitHubApi);


GitHubCache.prototype.getCache = function(cache_id, callback) {
  var self = this;
  self.cachedb.get(cache_id + ':tag', function(err, tag) {
    if (err) return callback(err);
    self.cachedb.get(cache_id + ':data', function(err, data) {
      if (err) return callback(err);
      callback(null, tag, JSON.parse(data));
    });
  });
};

GitHubCache.prototype.putCache = function(cache_id, cache_data, callback) {
  var self = this;
  self.cachedb.put(cache_id + ':tag', cache_data.meta.etag, function(err) {
    if (err) return callback(err);
    self.cachedb.put(cache_id + ':data', JSON.stringify(cache_data), function(err) {
      if (err) return callback(err);
      callback(null);
    });
  });
};
