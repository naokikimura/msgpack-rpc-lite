/*
 * MessagePack-RPC Implementation
 * ==============================
 * 
 * ## MessagePack-RPC Specification ##
 * 
 * See also: 
 *  - https://github.com/msgpack-rpc/msgpack-rpc/blob/master/spec.md
 *  - http://frsyuki.hatenablog.com/entry/20100406/p1
 */

const msgpack = require('msgpack-lite'),
    assert = require('assert'),
    events = require('events'),
    net = require('net'),
    util = require('util');

const debug = util.debuglog('msgpack-rpc-lite');
const tr = (object) => object.toString().replace(/\s/g, '');
const isDoNothingFunction = (fn) => tr(fn) === tr(function () { });
const enabled = !isDoNothingFunction(debug);
Object.defineProperty(debug, 'enabled', { get() { return enabled; } });

const msgidGenerator = (function () {
    const MAX = Math.pow(2, 32) - 1;
    let msgid = 0;
    return { next() { return (msgid = (msgid < MAX ? msgid + 1 : 0)); } };
}());

function Client(connectOptions, codecOptions) {
    events.EventEmitter.call(this);

    const encodeCodec = msgpack.createCodec((codecOptions || {}).encode);
    const decodeCodec = msgpack.createCodec((codecOptions || {}).decode);

    Object.defineProperties(this, {
        'encodeCodec': {
            get() { return encodeCodec; }
        },
        'decodeCodec': {
            get() { return decodeCodec; }
        },
        'connectOptions': {
            get() { return connectOptions; },
            set(value) { connectOptions = value; }
        },
        'close': {
            // It is left for compatibility with v0.0.2 or earlier.
            get() { return (() => { }); }
        }
    });
}

function send(message, callback = function () { }) {
    const self = this;
    const socket = net.createConnection(this.connectOptions, () => {
        const encodeStream = msgpack.createEncodeStream({ codec: this.encodeCodec });
        encodeStream.pipe(socket);
        encodeStream.end(message, (...args) => {
            if (debug.enabled) { debug(`sent message: ${util.inspect(message, false, null, true)}`); }
            if (message[0] === 2) { callback.apply(self, args); }
        });
        socket.end();
    });
    debug({ socket });

    const socketEvents = ['connect', 'end', 'timeout', 'drain', 'error', 'close'];
    socketEvents.reduce((socket, eventName) => socket.on(eventName, (...args) => {
        debug(`socket event [${eventName}]`);
        self.emit.apply(self, [eventName].concat(args));
    }), socket);

    if (message[0] === 0) {
        socket.pipe(msgpack.createDecodeStream({ codec: this.decodeCodec })).once('data', message => {
            if (debug.enabled) { debug(`received message: ${util.inspect(message, false, null, true)}`); }

            const [type, msgid, error, result] = message; // Response message
            assert.equal(type, 1);
            assert.equal(msgid, message[1]);
            callback.call(self, error, result, msgid);
        });
    }
}

function call(type, method, ...args) {
    const callback = typeof args[args.length - 1] === 'function' && args.pop();
    const message = [type].concat(type === 0 ? msgidGenerator.next() : [], method, [args]);
    if (callback) {
        send.call(this, message, callback);
    } else {
        return new Promise((resolve, reject) => {
            send.call(this, message, (error, ...args) => {
                if (error) { reject(error); } else { resolve(args); }
            });
        });
    }
}

function request(method, ...args) {
    return call.apply(this, [0, method].concat(args));
}

function notify(method, ...args) {
    return call.apply(this, [2, method].concat(args));
}

Client.prototype.request = request;
Client.prototype.call = request; // It is left for compatibility with v0.0.2 or earlier.
Client.prototype.notify = notify;
util.inherits(Client, events.EventEmitter);
exports.Client = Client;

function createClient(port, host = 'localhost', timeout = 0, codecOptions = { encode: {}, decode: {} }) {
    debug({ port, host, timeout, codecOptions });

    assert.equal(typeof port, 'number', 'Illegal argument: port');
    assert.equal(typeof host, 'string', 'Illegal argument: host');
    assert.equal(typeof timeout, 'number', 'Illegal argument: timeout');

    return new Client({ port, host, timeout }, codecOptions);
}
exports.createClient = createClient;

exports.createServer = function createServer(options, codecOptions = { encode: {}, decode: {} }) {
    const encodeCodec = msgpack.createCodec((codecOptions || {}).encode);
    const decodeCodec = msgpack.createCodec((codecOptions || {}).decode);
    const connectionListener = function onConnection(socket) {
        const self = this;
        socket.pipe(msgpack.createDecodeStream({ codec: decodeCodec })).on('data', message => {
            debug(message);
            if (message[0] === 0) {
                const [, msgid, method, params] = message; // Request message
                self.emit(method, params, (error, result) => {
                    const encodeStream = msgpack.createEncodeStream({ codec: encodeCodec });
                    encodeStream.pipe(socket);
                    encodeStream.write([1, msgid, error, [].concat(result)]); // Response message
                    encodeStream.end();
                });
            } else {
                const [, method, params] = message; // Notification message
                self.emit(method, params);
            }
        });
    };
    return net.createServer(options, connectionListener);
};