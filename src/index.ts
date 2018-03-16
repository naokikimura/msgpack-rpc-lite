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
import msgpack from 'msgpack-lite';
import assert from 'assert';
import events from 'events';
import net from 'net';
import util from 'util';

interface DebugLog extends Function {
    (message: any, ...params: any[]): void
    enabled: boolean;
}

const debug = (util.debuglog('msgpack-rpc-lite') as DebugLog);
const tr = (object: any) => object && object.toString().replace(/\s/g, '');
const equalsIgnoreSpace = (a: any, b: any): boolean => tr(a) === tr(b);
const isDoNothingFunction = (fn: Function) => equalsIgnoreSpace(fn, function () { });
const enabled = !isDoNothingFunction(debug);
Object.defineProperty(debug, 'enabled', { get() { return enabled; } });

interface CodecOptions {
    encode?: msgpack.CodecOptions;
    decode?: msgpack.CodecOptions;
}

const msgidGenerator = (function () {
    const MAX = Math.pow(2, 32) - 1;
    let msgid = 0;
    return { next() { return (msgid = (msgid < MAX ? msgid + 1 : 0)); } };
}());

/**
 * MessagePack-RPC client
*/
export class Client extends events.EventEmitter {
    connectOptions: net.NetConnectOpts;
    readonly encodeCodec: msgpack.Codec;
    readonly decodeCodec: msgpack.Codec;
    constructor(connectOptions: net.NetConnectOpts, codecOptions: CodecOptions = {}) {
        super();
        this.connectOptions = connectOptions;
        const encodeCodec = msgpack.createCodec((codecOptions || {}).encode);
        const decodeCodec = msgpack.createCodec((codecOptions || {}).decode);
        this.encodeCodec = encodeCodec;
        this.decodeCodec = decodeCodec;
        Object.defineProperties(this, {
            'encodeCodec': {
                get() { return encodeCodec; }
            },
            'decodeCodec': {
                get() { return decodeCodec; }
            }
        });
    }

    /**
     * Send a request message to the server
     * 
     * @param method { string } 
     * @param args 
     * @returns {Promise<[any, number]>}
     */
    request(method: string, ...args: any[]): Promise<[any, number]> {
        return call.apply(this, [0, method].concat(args));
    }

    /**
     * Send a request message to the server
     * 
     * @deprecated Please use the request method. It is left for compatibility with v0.0.2 or earlier.
     * @param method { string } 
     * @param args 
     * @returns {Promise<[any, number]>}
     */
    call(method: string, ...args: any[]): Promise<[any, number]> {
        return call.apply(this, [0, method].concat(args));
    }

    /**
     * Send a notification message to the server
     * 
     * @param method { string } 
     * @param args 
     * @returns {Promise<any[]>}
     */
    notify(method: string, ...args: any[]): Promise<any[]> {
        return call.apply(this, [2, method].concat(args));
    }

    /**
     * @deprecated This method does nothing. It is left for compatibility with v0.0.2 or earlier.
    */
    close(): void { };
}

function send(this: Client, message: any[], callback = function () { }) {
    const self = this;
    const socket = net.createConnection(this.connectOptions, () => {
        const encodeStream = msgpack.createEncodeStream({ codec: this.encodeCodec });
        encodeStream.pipe(socket);
        encodeStream.end(message, (...args: any[]) => {
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

function call(this: Client, type: number, method: string, ...args: any[]) {
    const callback = typeof args[args.length - 1] === 'function' && args.pop();
    const message = ([type] as any[]).concat(type === 0 ? msgidGenerator.next() : [], method, [args]);
    if (callback) {
        send.call(this, message, callback);
    } else {
        return new Promise((resolve, reject) => {
            send.call(this, message, (error: string, ...args: any[]) => {
                if (error) { reject(error); } else { resolve(args); }
            });
        });
    }
}

/**
 * Initiates a MessagePack-RPC client.
 * 
 * @param port { number } Port the socket should connect to.
 * @param host { string } Host the socket should connect to.
 * @param timeout { number } Sets the socket to timeout after timeout milliseconds of inactivity on the socket. If timeout is 0, then the existing idle timeout is disabled.
 * @param codecOptions { CodecOptions }
 * @returns { Client }
 */
export function createClient(port: number, host = 'localhost', timeout = 0, codecOptions: CodecOptions = {}): Client {
    debug({ port, host, timeout, codecOptions });

    assert.equal(typeof port, 'number', 'Illegal argument: port');
    assert.equal(typeof host, 'string', 'Illegal argument: host');
    assert.equal(typeof timeout, 'number', 'Illegal argument: timeout');
    return new Client({ port, host, timeout }, codecOptions);
}

/**
 * Creates a new MessagePack-RPC server.
 * 
 * @param option 
 * @param codecOptions { CodecOptions }
 * @returns { net.Server }
 */
export function createServer(options?: { allowHalfOpen?: boolean, pauseOnConnect?: boolean }, codecOptions: CodecOptions = { encode: {}, decode: {} }) {
    const encodeCodec = msgpack.createCodec((codecOptions || {}).encode);
    const decodeCodec = msgpack.createCodec((codecOptions || {}).decode);
    const connectionListener = function onConnection(this: net.Server, socket: net.Socket) {
        const self = this;
        socket.pipe(msgpack.createDecodeStream({ codec: decodeCodec })).on('data', (message: any[]) => {
            debug(message);
            if (message[0] === 0) {
                const [, msgid, method, params] = message; // Request message
                self.emit(method, params, (error: string, result: any) => {
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
}