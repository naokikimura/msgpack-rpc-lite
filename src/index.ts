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
import assert from 'assert';
import events from 'events';
import msgpack from 'msgpack-lite';
import net from 'net';
import util from 'util';

interface DebugLog extends Function {
    (message: any, ...params: any[]): void;
    enabled: boolean;
}

const debug = (util.debuglog('msgpack-rpc-lite') as DebugLog);
const tr = (object: any) => object && object.toString().replace(/\s/g, '');
const equalsIgnoreSpace = (a: any, b: any): boolean => tr(a) === tr(b);
// tslint:disable-next-line:only-arrow-functions no-empty
const isDoNothingFunction = (fn: DebugLog) => equalsIgnoreSpace(fn, function () { });
const enabled = !isDoNothingFunction(debug);
Object.defineProperty(debug, 'enabled', { get() { return enabled; } });

export interface CodecOptions {
    encode?: msgpack.CodecOptions;
    decode?: msgpack.CodecOptions;
}

const msgidGenerator = (() => {
    const MAX = Math.pow(2, 32) - 1;
    let msgid = 0;
    return { next() { return (msgid = (msgid < MAX ? msgid + 1 : 0)); } };
})();

type Message = [number, number, string, any[]] | [number, string, any[]];
type ResponseListener = (error: string, result: any, msgid: number) => void;
type WriteFinishListener = () => void;
type SendListener = ResponseListener | WriteFinishListener;
const isFunction = (object: any) => typeof object === 'function';

function createMessage(type: number, method: string, parameters: any[]): [Message, boolean | SendListener] {
    const params = parameters.slice(0);
    const callback = isFunction(params[params.length - 1]) && (params.pop() as SendListener);
    const message = (([] as any[]).concat(type, type === 0 ? msgidGenerator.next() : [], method, [params]) as Message);
    return [message, callback];
}

function parseMessage(message: Message): [number, number, string, any[]] {
    const msg = message.slice(0);
    const type = (msg.shift() as number);
    const params = (msg.pop() as any[]);
    const method = (msg.pop() as string);
    const msgid = (msg.pop() as number);
    return [type, msgid, method, params];
}

/**
 * MessagePack-RPC client
 */
export class Client extends events.EventEmitter {
    constructor(public connectOptions: net.NetConnectOpts, codecOptions: CodecOptions = {}) {
        super();
        const encodeCodec = msgpack.createCodec((codecOptions || {}).encode);
        const decodeCodec = msgpack.createCodec((codecOptions || {}).decode);
        Object.defineProperties(this, {
            decodeCodec: {
                get() { return decodeCodec; },
            },
            encodeCodec: {
                get() { return encodeCodec; },
            },
        });
    }
    get decodeCodec(): msgpack.Codec { return this.decodeCodec; }
    get encodeCodec(): msgpack.Codec { return this.encodeCodec; }

    /**
     * Send a request message to the server
     *
     * @param method { string }
     * @param parameters
     */
    public request(method: string, ...parameters: any[]) {
        const [message, callback] = createMessage(0, method, parameters);
        if (callback) {
            send.call(this, message, callback, undefined);
        } else {
            return new Promise<[any, number]>((resolve, reject) => {
                const executor = (error: string, result: any, msgid: number) =>
                    error ? reject(error) : resolve([result, msgid]);
                send.call(this, message, executor, undefined);
            });
        }
    }

    /**
     * Send a request message to the server
     *
     * @deprecated Please use the request method. It is left for compatibility with v0.0.2 or earlier.
     * @param method { string }
     * @param args
     * @returns {Promise<[any, number]> | undefined}
     */
    public call(method: string, ...args: any[]): Promise<[any, number]> | undefined {
        return this.request.apply(this, [method, args]);
    }

    /**
     * Send a notification message to the server
     *
     * @param method { string }
     * @param parameters
     */
    public notify(method: string, ...parameters: any[]) {
        const [message, callback] = createMessage(2, method, parameters);
        if (callback) {
            send.call(this, message, undefined, callback);
        } else {
            return new Promise(resolve => send.call(this, message, undefined, () => resolve()));
        }
    }

    /**
     * @deprecated This method does nothing. It is left for compatibility with v0.0.2 or earlier.
     */
    // tslint:disable-next-line:no-empty
    public close(): void { }
}

// tslint:disable-next-line:no-empty max-line-length
function send(this: Client, message: Message, responseListener: ResponseListener = () => { }, writeFinishListener: WriteFinishListener = () => { }) {
    const socket = net.createConnection(this.connectOptions, () => {
        const encodeStream = msgpack.createEncodeStream({ codec: this.encodeCodec });
        encodeStream.pipe(socket);
        encodeStream.end(message, () => {
            if (debug.enabled) { debug(`sent message: ${util.inspect(message, false, null, true)}`); }
            writeFinishListener();
        });
        socket.end();
    });
    debug({ socket });

    const socketEvents = ['connect', 'end', 'timeout', 'drain', 'error', 'close'];
    socketEvents.reduce((accumulator, eventName) => accumulator.on(eventName, (...args) => {
        debug(`socket event [${eventName}]`);
        this.emit.apply(this, [eventName].concat(args));
    }), socket);

    socket.pipe(msgpack.createDecodeStream({ codec: this.decodeCodec })).on('data', response => {
        if (debug.enabled) { debug(`received message: ${util.inspect(response, false, null, true)}`); }

        const [type, msgid, error, result] = (response as any); // Response message
        assert.equal(type, 1);
        assert.equal(msgid, message[1]);
        responseListener(error, result, msgid);
    });
}

/**
 * Initiates a MessagePack-RPC client.
 *
 * @param port { number } Port the socket should connect to.
 * @param host { string } Host the socket should connect to.
 * @param timeout { number } Sets the socket to timeout after timeout milliseconds of inactivity on the socket.
 *  If timeout is 0, then the existing idle timeout is disabled.
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
 * @param options
 * @param codecOptions { CodecOptions }
 * @returns { net.Server }
 */
export function createServer(options?: { allowHalfOpen?: boolean, pauseOnConnect?: boolean }, codecOptions?: CodecOptions) {
    const encodeCodec = msgpack.createCodec((codecOptions || {}).encode);
    const decodeCodec = msgpack.createCodec((codecOptions || {}).decode);
    const connectionListener = function onConnection(this: net.Server, socket: net.Socket) {
        socket.pipe(msgpack.createDecodeStream({ codec: decodeCodec })).on('data', (message: Message) => {
            debug(message);
            const [type, msgid, method, params] = parseMessage(message);
            const callback = type === 2 ? undefined : (error: string, result: any) => {
                const encodeStream = msgpack.createEncodeStream({ codec: encodeCodec });
                encodeStream.pipe(socket);
                encodeStream.end([1, msgid, error, [].concat(result)]); // Response message
            };
            this.emit(method, params, callback);
        });
    };
    return net.createServer(options, connectionListener);
}
