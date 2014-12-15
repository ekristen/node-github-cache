# Caching Layer for Node-GitHub

This is a Node.JS module that transparently adds caching for the [node-github](https://github.com/mikedeboer/node-github) project.

## Installation

Install with Node.JS package manager

```
$ npm install github-cache
```

## Documentation

You use this class just like you would use [node-github](https://github.com/mikedeboer/node-github). 

If you want to not use the cache at any time, add `cache: false` to your API call.

## Example

```
var GitHubApi = require("github-cache");

var github = new GitHubApi({
  version: "3.0.0",
  debug: true,
});
github.user.getFollowingFromUser({
  user: "ekristen",
  cache: false
}, function(err, res) {
  console.log(JSON.stringify(res));
});
```
