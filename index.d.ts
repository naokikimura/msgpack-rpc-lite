import * as net from "net";
import * as msgpack from "msgpack-lite";

interface CodecOptions {
  encode?: msgpack.CodecOptions;
  decode?: msgpack.CodecOptions;
}

/**
 * MessagePack-RPC client
*/
export interface Client {

  /**
   * Send a request message to the server
   * 
   * @param method { string } 
   * @param args 
   * @returns {Promise<[ any, number ]>}
   */
  request(method: string, ...args): Promise<[ any, number ]>;

  /**
   * Send a request message to the server
   * 
   * @deprecated Please use the request method. It is left for compatibility with v0.0.2 or earlier.
   * @param method { string } 
   * @param args 
   * @returns {Promise<[ any, number ]>}
   */
  call(method: string, ...args): Promise<[ any, number ]>;

  /**
   * Send a notification message to the server
   * 
   * @param method { string } 
   * @param args 
   * @returns {Promise<[ any, number ]>}
   */
  notify(method: string, ...args): Promise<[ any, number ]>;

  readonly encodeCodec: msgpack.Codec;
  readonly decodeCodec: msgpack.Codec;
  connectOptions: net.NetConnectOpts;

  /**
   * @deprecated This method does nothing. It is left for compatibility with v0.0.2 or earlier.
  */
  readonly close(): void;
}

export interface ClientConstructor {
  new(connectOptions: net.NetConnectOpts, codecOptions?: CodecOptions): Client
  readonly prototype: Client;
}

export declare const Client: ClientConstructor

/**
 * Initiates a MessagePack-RPC client.
 * 
 * @param port { number } Port the socket should connect to.
 * @param host { string } Host the socket should connect to.
 * @param timeout { number } Sets the socket to timeout after timeout milliseconds of inactivity on the socket. If timeout is 0, then the existing idle timeout is disabled.
 * @param codecOptions { CodecOptions }
 * @returns { Client }
 */
export declare function createClient(port: number, host?: string, timeout?: number, codecOptions?: CodecOptions): Client;

/**
 * Creates a new MessagePack-RPC server.
 * 
 * @param option 
 * @param codecOptions { CodecOptions }
 * @returns { net.Server }
 */
export declare function createServer(option?: { allowHalfOpen?: boolean, pauseOnConnect?: boolean }, codecOptions?: CodecOptions): net.Server;