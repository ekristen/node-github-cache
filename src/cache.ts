import Logger = require('bunyan');
import { cloneDeep, omit } from 'lodash';
import * as objectHash from 'object-hash';

interface Options {
  prefix: string;
  separator: string;
}

interface Cache {
  get(key: string): Promise<string>;
  set(key: string, value: string): Promise<string>;
  del(key: string): Promise<boolean>;
  exists(key: string): Promise<boolean>;
}

export const OctokitPlugin = (cache: OctokitCache, logger: Logger | null = null) => {
  const trace = (obj: any, msg: any) => {
    if (logger !== null && typeof logger.child === 'function' && typeof logger.trace === 'function') {
      logger.child({component: 'octokit/plugin/cache'}).trace(obj, msg);
    }
  };

  return (octokit) => {
    octokit.hook.error('request', async (err, options) => {
      if (err.code === 304) {
        return await cache.getCache(options);
      } else {
        throw err;
      }
    });
    octokit.hook.before('request', async (options) => {
      trace({options}, 'before: request - options');
      if (await cache.inCache(options) === true) {
        const etag = await cache.getEtag(options);
        options.headers['If-None-Match'] = etag;
        trace({etag}, 'request: etag header set');
      }
    });
    octokit.hook.after('request', async (result, options) => {
      trace({options}, 'after: request - options');
      if (result.status !== 304) {
        trace({result}, 'after: status not 304 - caching results');
        await cache.putCache(options, result);
      }
    });
  };
};

export class OctokitCache {
  public cache;
  private logger;
  private prefix: string;
  private separator: string;

  constructor(cache: Cache, options: Options = { prefix: 'cache', separator: ':'}, logger: Logger | null = null) {
    this.prefix = options.prefix;
    this.separator = options.separator;

    if (this.prefix) {
      this.prefix += this.separator;
    }

    this.cache = cache;
    this.logger = logger;
  }

  public hashIt(options): string {
    const opts = omit(cloneDeep(options), ['headers', 'request']);
    opts.url = opts.url.replace(/access_token=[a-z0-9]{40}/ig, '').replace(/\?$/ig, '');

    const hash = objectHash(opts);
    this.trace({hash}, 'hashIt');
    return hash;
  }

  public async inCache(options): Promise<boolean> {
    const hash = this.hashIt(options);
    const exists = await this.cache.exists(`${this.prefix}${hash}${this.separator}etag`);
    this.trace({hash, exists}, `inCache - ${exists}`);
    return Promise.resolve(exists);
  }

  public async getEtag(options): Promise<string> {
    const hash = this.hashIt(options);
    const etag = await this.cache.get(`${this.prefix}${hash}${this.separator}etag`);
    this.trace({hash, etag}, 'getEtag');
    return Promise.resolve(etag);
  }

  public async getCache(options): Promise<any> {
    const hash = this.hashIt(options);

    const data = await this.cache.get(`${this.prefix}${hash}${this.separator}data`);
    const headers = await this.cache.get(`${this.prefix}${hash}${this.separator}headers`);
    headers.status = '304 Not Modified';
    const status = 304;

    this.trace({hash, status}, 'getCache');

    return Promise.resolve({
      data,
      headers,
      status,
    });
  }

  public async putCache(options, results): Promise<boolean> {
    const hash = this.hashIt(options);

    await this.cache.set(`${this.prefix}${hash}${this.separator}etag`, results.headers.etag);
    await this.cache.set(`${this.prefix}${hash}${this.separator}data`, results.data);
    await this.cache.set(`${this.prefix}${hash}${this.separator}headers`, results.headers);

    this.trace({hash, prefix: `${this.prefix}${hash}${this.separator}`}, 'putCache');

    return Promise.resolve(true);
  }

  private trace(obj: any, msg: any): void {
    if (this.logger !== null && typeof this.logger.child === 'function' && typeof this.logger.trace === 'function') {
      this.logger.child({component: 'octokit/plugin/cache'}).trace(obj, msg);
    }
  }
}
