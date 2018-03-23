import { expect } from 'chai';
import debuglog from 'debug';
import net from 'net';
import portfinder from 'portfinder';
import * as rpc from '../src/';

const debug = debuglog('msgpack-rpc-lite:test');

describe('msgpack-rpc#request', () => {

    const options = { port: Number(process.env.npm_package_config_test_port || 9199) };
    let server: net.Server;

    afterEach(done => {
        server && server.close();
        done();
    });

    it('call', done => {
        portfinder.getPortPromise(options).then(port => {
            debug({ port });

            server = rpc.createServer().on('foo', (params, callback) => {
                expect(params).to.have.ordered.members([1, 2, 3]);
                callback(null, 'bar');
            });
            server.listen(port);

            const client = new rpc.Client({ port });
            return client.call('foo', 1, 2, 3);
        }).then(([response]) => {
            expect(response).to.equal('bar');
            done();
        }).catch(done);
    });

    it('should be empty when call without arguments', done => {
        portfinder.getPortPromise(options).then(port => {
            debug({ port });

            server = rpc.createServer().on('foo', (params, callback) => {
                expect(params).to.be.a('array').and.to.have.property('length', 0);
                callback(null, params.length);
            });
            server.listen(port);

            const client = rpc.createClient(port);
            return new Promise<[any, number]>((resolve, reject) => {
                client.request('foo', (error: string, response: any, msgid: number) => {
                    if (error) { reject(error); } else { resolve([response, msgid]); }
                });
            });
        }).then(([response]) => {
            expect(response).to.equal(0);
            done();
        }).catch(done);
    });

    it('should be error when call unimplemented method', done => {
        portfinder.getPortPromise(options).then(port => {
            debug({ port });

            server = rpc.createServer().on('foo', (params, callback) => {
                expect(params).to.be.a('array').and.to.have.property('length', 0);
                callback(null, params.length);
            });
            server.listen(port);

            return rpc.createClient(port).request('bar', 1, 2, 3);
        }).then(done).catch(error => {
            expect(error).to.equal('Not Implemented');
            done();
        });
    });

});

describe('msgpack-rpc#notify', () => {

    const options = { port: Number(process.env.npm_package_config_test_port || 9199) };
    let server: net.Server;

    afterEach(done => {
        server && server.close();
        done();
    });

    it('notify', done => {
        portfinder.getPortPromise(options).then(port => {
            debug({ port });

            server = rpc.createServer().on('qux', params => {
                expect(params).to.have.ordered.members([1, 2, 3]);
                done();
            });
            server.listen(port);

            const client = rpc.createClient(port);
            client.notify('qux', 1, 2, 3);
        }).catch(done);
    });

});
