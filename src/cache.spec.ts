import { expect } from 'chai';
import * as Octokit from '@octokit/rest';
import * as bunyan from 'bunyan';
import * as through2 from 'through2';

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

  let rateLimitStart = 0;

  it('does not return cached data on first call', async () => {
    await octokit.users.getFollowingForUser({
      username: 'ekristen',
    }).then(({data, headers, status}) => {
      rateLimitStart = headers['x-ratelimit-remaining'];
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

  it('does return cached data on third call', async () => {
    await octokit.users.getFollowingForUser({
      username: 'ekristen',
    }).then(({data, headers, status}) => {
      expect(status).to.be.equal(304);
    });
  });
  
  it('does return cached data on fourth call', async () => {
    await octokit.users.getFollowingForUser({
      username: 'ekristen',
    }).then(({data, headers, status}) => {
      expect(status).to.be.equal(304);
    });
  });

  it('does return cached data on fifth call', async () => {
    await octokit.users.getFollowingForUser({
      username: 'ekristen',
    }).then(({data, headers, status}) => {
      expect(status).to.be.equal(304);
    });
  });

  it('does return cached data on six call', async () => {
    await octokit.users.getFollowingForUser({
      username: 'ekristen',
    }).then(({data, headers, status}) => {
      expect(rateLimitStart).to.be.equal(rateLimitStart);
      expect(status).to.be.equal(304);
    });
  });
});

if (process.env.GITHUB_TOKEN) {
  describe('OctokitCache - caching w/ oauth2 authentication', () => {
    const cache = new OctokitCache(new MemoryCache(), options);
    const octokit = new Octokit() as any;
    octokit.plugin(OctokitPlugin(cache))

    octokit.authenticate({
      type: 'oauth',
      token: process.env.GITHUB_TOKEN,
    });

    let rateLimitStart = 0;

    it('does not return cached data on first call', async () => {
      await octokit.users.getFollowingForUser({
        username: 'ekristen',
      }).then(({data, headers, status}) => {
        rateLimitStart = headers['x-ratelimit-remaining'];
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

    it('does return cached data on third call', async () => {
      await octokit.users.getFollowingForUser({
        username: 'ekristen',
      }).then(({data, headers, status}) => {
        expect(status).to.be.equal(304);
      });
    });
  
    it('does return cached data on fourth call', async () => {
      await octokit.users.getFollowingForUser({
        username: 'ekristen',
      }).then(({data, headers, status}) => {
        expect(status).to.be.equal(304);
      });
    });

    it('does return cached data on fifth call', async () => {
      await octokit.users.getFollowingForUser({
        username: 'ekristen',
      }).then(({data, headers, status}) => {
        expect(status).to.be.equal(304);
      });
    });

    it('does return cached data on six call', async () => {
      await octokit.users.getFollowingForUser({
        username: 'ekristen',
      }).then(({data, headers, status}) => {
        expect(rateLimitStart).to.be.equal(rateLimitStart);
        expect(status).to.be.equal(304);
      });
    });
  });
}

if (process.env.GITHUB_TOKEN) {
  describe('OctokitCache - caching w/ token authentication', () => {
    const cache = new OctokitCache(new MemoryCache(), options);
    const octokit = new Octokit() as any;
    octokit.plugin(OctokitPlugin(cache))

    octokit.authenticate({
      type: 'token',
      token: process.env.GITHUB_TOKEN,
    });

    let rateLimitStart = 0;

    it('does not return cached data on first call', async () => {
      await octokit.users.getFollowingForUser({
        username: 'ekristen',
      }).then(({data, headers, status}) => {
        rateLimitStart = headers['x-ratelimit-remaining'];
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

    it('does return cached data on third call', async () => {
      await octokit.users.getFollowingForUser({
        username: 'ekristen',
      }).then(({data, headers, status}) => {
        expect(status).to.be.equal(304);
      });
    });
  
    it('does return cached data on fourth call', async () => {
      await octokit.users.getFollowingForUser({
        username: 'ekristen',
      }).then(({data, headers, status}) => {
        expect(status).to.be.equal(304);
      });
    });

    it('does return cached data on fifth call', async () => {
      await octokit.users.getFollowingForUser({
        username: 'ekristen',
      }).then(({data, headers, status}) => {
        expect(status).to.be.equal(304);
      });
    });

    it('does return cached data on six call', async () => {
      await octokit.users.getFollowingForUser({
        username: 'ekristen',
      }).then(({data, headers, status}) => {
        expect(rateLimitStart).to.be.equal(rateLimitStart);
        expect(status).to.be.equal(304);
      });
    });
  });
}

describe('OctokitCache - logging', () => {
  let loggerCallCount: number = 0;
  let loggerMessages: string[] = [];

  const logger = bunyan.createLogger({
    name: 'tests',
    level: 'trace',
    streams: [{
      level: 'trace',
      stream: through2.obj((chunk, enc, callback) => {
        loggerCallCount++;

        try {
          const data = JSON.parse(chunk);

          loggerMessages.push(data.msg);

          callback();
        } catch (err) {
          callback(err);
        }
      }),
    }],
  });

  const cache = new OctokitCache(new MemoryCache(), options, logger);
  const octokit = new Octokit() as any;
  octokit.plugin(OctokitPlugin(cache, logger))

  it('logs 3 times, does not return cached data on first call', async () => {
    const expectedMessages = ['before: request - options','hashIt','inCache - false','after: request - options','after: status not 304 - caching results','hashIt','putCache'];

    await octokit.users.getFollowingForUser({
      username: 'ekristen',
    }).then(({data, headers, status}) => {
      expect(loggerCallCount).to.be.equal(7);
      
      for (var msg of expectedMessages) {
        expect(loggerMessages.shift()).to.be.equal(msg);
      }

      expect(status).to.be.equal(200);
    });
  });

  it('logs 3 times, returns cached data on second call', async () => {
    const expectedMessages = [
      'before: request - options',
      'hashIt',
      'inCache - true',
      'hashIt',
      'getEtag',
      'request: etag header set',
      'hashIt',
      'getCache',
      'after: request - options',
    ];

    await octokit.users.getFollowingForUser({
      username: 'ekristen',
    }).then(({data, headers, status}) => {
      expect(loggerCallCount).to.be.equal(16);

      for (var msg of expectedMessages) {
        expect(loggerMessages.shift()).to.be.equal(msg);
      }

      expect(status).to.be.equal(304);
    });
  });
});
