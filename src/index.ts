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
const equalsIgnoreSpace = (lhs: any, rhs: any): boolean => tr(lhs) === tr(rhs);
// tslint:disable-next-line:only-arrow-functions no-empty ban-types
const isDoNothingFunction = (fn: Function) => equalsIgnoreSpace(fn, function () { });
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

type RequestMessage = [0, number, string, any[]];
type ResponseMessage = [1, number, string, any];
type NotifyMessage = [2, string, any[]];
type Message = RequestMessage | ResponseMessage | NotifyMessage;
type ResponseListener = (error: string | null, result: any, msgid: number) => void;
type WriteFinishListener = () => void;
type SendListener = ResponseListener | WriteFinishListener;
const isFunction = (object: any) => typeof object === 'function';
const last = (array: any[]) => array[array.length - 1];
const popUnless = (array: any[], predicate: (object: any) => boolean) => predicate(last(array)) ? array.pop() : undefined;

function createMessage(type: 0 | 2, method: string, parameters: any[]): [Message, SendListener] {
    const params = parameters.slice(0);
    const callback: SendListener = popUnless(params, isFunction);
    const message = (([] as any[]).concat(type, type === 0 ? msgidGenerator.next() : [], method, [params]) as Message);
    return [message, callback];
}

function parseMessage(message: Message) {
    const msg = message.slice(0);
    const type = (msg.shift() as number);
    const paramsOrResult = msg.pop();
    const methodOrError = (msg.pop() as string);
    const msgid = (msg.pop() as number);
    return {
        error: type === 1 ? methodOrError : undefined,
        method: type !== 1 ? methodOrError : undefined,
        msgid,
        params: type !== 1 ? paramsOrResult : undefined,
        result: type === 1 ? paramsOrResult : undefined,
        type,
    };
}

function writeMessage(socket: net.Socket, message: Message, option?: msgpack.EncoderOptions) {
    const encodeStream = msgpack.createEncodeStream(option);
    encodeStream.pipe(socket);
    return new Promise(resolve => encodeStream.end(message, resolve)).then(() => void (encodeStream.unpipe(socket)));
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
        const [message, callback] = (createMessage(0, method, parameters) as [Message, ResponseListener]);
        if (callback) {
            send(this, message, callback);
        } else {
            const executor = (resolve: (response: [any, number]) => void, reject: (error: string) => void) => {
                const listener = (error: string | null, ...response: any[]) =>
                    error ? reject(error) : resolve((response as [any, number]));
                send(this, message, listener);
            };
            return new Promise<[any, number]>(executor);
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
        return this.request(method, ...args);
    }

    /**
     * Send a notification message to the server
     *
     * @param method { string }
     * @param parameters
     */
    public notify(method: string, ...parameters: any[]) {
        const [message, callback] = (createMessage(2, method, parameters) as [Message, WriteFinishListener]);
        if (callback) {
            send(this, message, undefined, callback);
        } else {
            return new Promise(resolve => send(this, message, undefined, () => resolve()));
        }
    }

    /**
     * @deprecated This method does nothing. It is left for compatibility with v0.0.2 or earlier.
     */
    // tslint:disable-next-line:no-empty
    public close(): void { }
}

// tslint:disable-next-line:no-empty max-line-length
function send(clinet: Client, message: Message, responseListener: ResponseListener = () => { }, writeFinishListener: WriteFinishListener = () => { }) {
    const socket = net.createConnection(clinet.connectOptions, () => {
        writeMessage(socket, message, { codec: clinet.encodeCodec }).then(() => {
            debug.enabled && debug(`sent message: ${util.inspect(message, false, null, true)}`);
            writeFinishListener();
            socket.end();
        });
    });

    const socketEvents = ['connect', 'end', 'timeout', 'drain', 'error', 'close'];
    socketEvents.reduce((accumulator, eventName) => accumulator.on(eventName, (...args) => {
        debug(`socket event [${eventName}]`);
        clinet.emit(eventName, ...args);
    }), socket);

    socket.pipe(msgpack.createDecodeStream({ codec: clinet.decodeCodec })).on('data', response => {
        debug.enabled && debug(`received message from server: ${util.inspect(response, false, null, true)}`);
        const { type, msgid, error = null, result } = parseMessage(response as any); // Response message
        debug.enabled && assert.deepEqual({ type, msgid }, { type: 1, msgid: parseMessage(message).msgid });
        responseListener(error, result, msgid);
    });

    debug.enabled && debug(util.inspect(socket, false, 0));
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
            debug.enabled && debug(`received message from client: ${util.inspect(message, false, null, true)}`);
            const { type, msgid, method = '', params } = parseMessage(message);
            const callback = type === 2 ? undefined : (error: string, result: any) => {
                const response: Message = [1, msgid, error, result]; // Response message
                writeMessage(socket, response, { codec: encodeCodec });
            };
            if (this.eventNames().indexOf(method) > -1) {
                this.emit(method, params, callback);
            } else {
                writeMessage(socket, [1, msgid, 'Not Implemented', null], { codec: encodeCodec });
            }
        });
    };
    return net.createServer(options, connectionListener);
}
