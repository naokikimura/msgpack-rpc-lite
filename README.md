# msgpack-rpc-lite

[![npm version](https://badge.fury.io/js/msgpack-rpc-lite.svg)](https://badge.fury.io/js/msgpack-rpc-lite)
[![Build Status](https://travis-ci.org/naokikimura/msgpack-rpc-lite.svg?branch=master)](https://travis-ci.org/naokikimura/msgpack-rpc-lite)
[![Codacy Badge](https://api.codacy.com/project/badge/Grade/85c5e44e31da475ebcaae8f1b79de7c8)](https://app.codacy.com/app/n.kimura.cap/msgpack-rpc-lite?utm_source=github.com&utm_medium=referral&utm_content=naokikimura/msgpack-rpc-lite&utm_campaign=badger)
[![Codacy Badge](https://api.codacy.com/project/badge/Coverage/5a32022009694006ab61191e243e569f)](https://www.codacy.com/app/n.kimura.cap/msgpack-rpc-lite?utm_source=github.com&utm_medium=referral&utm_content=naokikimura/msgpack-rpc-lite&utm_campaign=Badge_Coverage)
[![codecov](https://codecov.io/gh/naokikimura/msgpack-rpc-lite/branch/master/graph/badge.svg)](https://codecov.io/gh/naokikimura/msgpack-rpc-lite)
[![Dependency Status](https://beta.gemnasium.com/badges/github.com/naokikimura/msgpack-rpc-lite.svg)](https://beta.gemnasium.com/projects/github.com/naokikimura/msgpack-rpc-lite)
[![Known Vulnerabilities](https://snyk.io/test/github/naokikimura/msgpack-rpc-lite/badge.svg?targetFile=package.json)](https://snyk.io/test/github/naokikimura/msgpack-rpc-lite?targetFile=package.json)

Implementation of MessagePack-RPC with msgpack-lite

## Usage ##

- __createServer([*serverOptions*][, *codecOptions*])__

    Creates a new MessagePack-RPC server.

    - `serverOptions` &lt;Object> See [net.createServer([options][, connectionListener])](https://nodejs.org/api/net.html#net_net_createserver_options_connectionlistener)
    - `codecOptions` &lt;Object>
        - `encode` See [Custom Codec Options][1]
        - `decode` See [Custom Codec Options][1]
    - Returns: &lt;net.Server>

- __Server event: *method*__

    Emitted when a new connection is made.

    - &lt;Array> request parameters.
    - &lt;Function> If a request is received, a callback function is passed.
        - To return the results to the client, pass `null` as the first argument and response parameters as the second argument.
        - If an error occurs, pass it to the first argument.

- __createClient(*port*[, *host*][, *timeout*][, *codecOptions*])__

    Initiates a MessagePack-RPC client.

    - `port` &lt;number> Port the socket should connect to.
    - `host` &lt;string> Host the socket should connect to. Default: `'localhost'`
    - `timeout` &lt;number> Sets the socket to timeout after timeout milliseconds of inactivity on the socket. If timeout is 0, then the existing idle timeout is disabled. Default: `0`
    - `codecOptions` &lt;Object>
        - `encode` See [Custom Codec Options][1]
        - `decode` See [Custom Codec Options][1]
    - Return: &lt;Client>

- __client.request(*method*[, *...args*])__

    - `method` &lt;string>
    - Return: &lt;Promise>

- __client.notify(*method*[, *...args*])__

    - `method` &lt;string>
    - Return: &lt;Promise>

[1]: https://github.com/kawanet/msgpack-lite#custom-codec-options

## Examples ##

- Server
    ```js
    const rpc = require('msgpack-rpc-lite');
    const server = rpc.createServer().on('say', (params, callback) => {
        const [ message ] = params; 
        callback(null, `hello ${ message }`);
    });
    server.listen(9199);
    ```

- Client
    ```js
    const rpc = require('msgpack-rpc-lite');

    const client = rpc.createClient(9199, 'localhost');
    client.request('say', [ 'world' ]).then(([ response ]) => {
        console.log(response); // hello world
    })
    ```

## Compatibility Mode ##

Set `true` to `useraw` of `encode`/`decode` of Codec-options.

- Client
    ```js
    const codecOptions = { encode: { useraw: true }, decode: { useraw: true } };

    const client = rpc.createClient(9199, 'localhost', 0, codecOptions);
    ```

See also:
- https://github.com/kawanet/msgpack-lite#compatibility-mode
- https://github.com/msgpack/msgpack/blob/master/spec.md#upgrading-messagepack-specification

## See also ##

- [MessagePack-RPC Specification](https://github.com/msgpack-rpc/msgpack-rpc/blob/master/spec.md)
- http://frsyuki.hatenablog.com/entry/20100406/p1
- [MessagePack specification](https://github.com/msgpack/msgpack/blob/master/spec.md)
- [msgpack-lite](https://github.com/kawanet/msgpack-lite)
