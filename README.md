# msgpack-rpc-lite

[![npm version](https://badge.fury.io/js/msgpack-rpc-lite.svg)](https://badge.fury.io/js/msgpack-rpc-lite)
[![Build Status](https://travis-ci.org/naokikimura/msgpack-rpc-lite.svg?branch=master)](https://travis-ci.org/naokikimura/msgpack-rpc-lite)
[![Codacy Badge](https://api.codacy.com/project/badge/Grade/85c5e44e31da475ebcaae8f1b79de7c8)](https://app.codacy.com/app/n.kimura.cap/msgpack-rpc-lite?utm_source=github.com&utm_medium=referral&utm_content=naokikimura/msgpack-rpc-lite&utm_campaign=badger)
[![Codacy Badge](https://api.codacy.com/project/badge/Coverage/5a32022009694006ab61191e243e569f)](https://www.codacy.com/app/n.kimura.cap/msgpack-rpc-lite?utm_source=github.com&utm_medium=referral&utm_content=naokikimura/msgpack-rpc-lite&utm_campaign=Badge_Coverage)

Implementation of MessagePack-RPC with msgpack-lite

## Usage ##

- __createServer([serverOptions][, codecOptions])__

    Creates a new MessagePack-RPC server.

    - `serverOptions` &lt;Object> See [net.createServer([options][, connectionListener])](https://nodejs.org/api/net.html#net_net_createserver_options_connectionlistener)
    - `codecOptions` &lt;Object>
    - Returns: &lt;net.Server>

- __createClient([port][, host][, timeout][, codecOptions])__

    Initiates a MessagePack-RPC client.

    - `port` &lt;number> Port the socket should connect to.
    - `host` &lt;string> Host the socket should connect to. Default: `'localhost'`
    - `timeout` &lt;number> Sets the socket to timeout after timeout milliseconds of inactivity on the socket. If timeout is 0, then the existing idle timeout is disabled. Default: `0`
    - `codecOptions`

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

- Server
    ```js
    const codecOptions = { encode: { useraw: true }, decode: { useraw: true } };

    const server = rpc.createServer({}, codecOptions);
    ```

- Client
    ```js
    const codecOptions = { encode: { useraw: true }, decode: { useraw: true } };

    const client = rpc.createClient(9199, 'localhost', 0, codecOptions);
    ```

## See also ##

- [MessagePack-RPC Specification](https://github.com/msgpack-rpc/msgpack-rpc/blob/master/spec.md)
- http://frsyuki.hatenablog.com/entry/20100406/p1
- [MessagePack specification](https://github.com/msgpack/msgpack/blob/master/spec.md)
- [msgpack-lite](https://github.com/kawanet/msgpack-lite)