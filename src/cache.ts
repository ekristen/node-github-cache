import * as lodash from 'lodash';
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

export const OctokitPlugin = (cache: OctokitCache) => {
  return (octokit) => {
    octokit.hook.error('request', async (err, options) => {
      if (err.code === 304) {
        return await cache.getCache(options);
      } else {
        throw err;
      }
    });
    octokit.hook.before('request', async (options) => {
      if (await cache.inCache(options) === true) {
        const etag = await cache.getEtag(options);
        options.headers['If-None-Match'] = etag;
      }
    });
    octokit.hook.after('request', async (result, options) => {
      if (result.status !== 304) {
        await cache.putCache(options, result);
      }
    });
  };
};

export class OctokitCache {
  public cache;
  private prefix: string;
  private separator: string;

  constructor(cache: Cache, options: Options = { prefix: 'cache', separator: ':'}) {
    this.prefix = options.prefix;
    this.separator = options.separator;

    if (this.prefix) {
      this.prefix += this.separator;
    }

    this.cache = cache;
  }

  public async inCache(options): Promise<boolean> {
    const hash = objectHash(lodash.omit(options, ['headers']));
    const exists = await this.cache.exists(`${this.prefix}${hash}${this.separator}etag`);
    return exists;
  }

  public async getEtag(options): Promise<string> {
    const hash = objectHash(lodash.omit(options, ['headers']));
    return await this.cache.get(`${this.prefix}${hash}${this.separator}etag`);
  }

  public async getCache(options) {
    const hash = objectHash(lodash.omit(options, ['headers']));

    const data = await this.cache.get(`${this.prefix}${hash}${this.separator}data`);
    const headers = await this.cache.get(`${this.prefix}${hash}${this.separator}headers`);
    headers.status = '304 Not Modified';
    const status = 304;

    return {
      data,
      headers,
      status,
    };
  }

  public async putCache(options, results): Promise<boolean> {
    const hash = objectHash(lodash.omit(options, ['headers']));

    await this.cache.set(`${this.prefix}${hash}${this.separator}etag`, results.headers.etag);
    await this.cache.set(`${this.prefix}${hash}${this.separator}data`, results.data);
    await this.cache.set(`${this.prefix}${hash}${this.separator}headers`, results.headers);

    return true;
  }
}
