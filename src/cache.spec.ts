import { expect } from 'chai';
import * as Octokit from '@octokit/rest';

import {
  OctokitCache,
  OctokitPlugin,
} from './cache';

class MemoryCache {
  public data;

  constructor () {
    this.data = {};
  }

  getData () {
    return this.data;
  }

  async get (key: string): Promise<string> {
    const data = await Promise.resolve(this.data[key]);
    return data;
  }
  async set (key: string, value: string): Promise<string> {
    this.data[key] = value;
    return await this.get(key);
  }
  async del (key: string): Promise<boolean> {
    delete this.data[key];
    return Promise.resolve(true);
  }
  async exists (key: string): Promise<boolean> {
    if (typeof this.data[key] === 'undefined') {
      return false;
    }
    return true;
  }
}

const options = {
  prefix: 'cache',
  separator: '/',
};

describe('OctokitCache', () => {
  it('does initialize', () => {
    new OctokitCache(new MemoryCache(), options);
  });

  it('does initialize plugin', () => {
    const cache = new OctokitCache(new MemoryCache(), options);
    const octokit = new Octokit() as any;
    octokit.plugin(OctokitPlugin(cache))
  });
});

describe('OctokitCache - caching', () => {
  const cache = new OctokitCache(new MemoryCache(), options);
  const octokit = new Octokit() as any;
  octokit.plugin(OctokitPlugin(cache))

  it('does not return cached data on first call', async () => {
    await octokit.users.getFollowingForUser({
      username: 'ekristen',
    }).then(({data, headers, status}) => {
      expect(status).to.be.equal(200);
    });
  });

  it('does return cached data on second call', async () => {
    await octokit.users.getFollowingForUser({
      username: 'ekristen',
    }).then(({data, headers, status}) => {
      expect(status).to.be.equal(304);
    });
  });
  
});

