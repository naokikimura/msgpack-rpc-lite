const expect = require('chai').expect;
const portfinder = require('portfinder');
const debug = require('debug')('msgpack-rpc-lite:test');
const rpc = require('../');

describe('msgpack-rpc#request', () => {

    const option = { port: Number(process.env.npm_package_config_test_port || 9199) };
    let server;
    let client;

    afterEach(done => {
        client && client.close();
        client = null;
        server && server.close();
        server = null;
        done();
    });

    it('call', done => {
        portfinder.getPortPromise(option).then(port => {
            debug({ port });

            server = rpc.createServer().on('foo', (params, done) => {
                expect(params).to.have.ordered.members([ 1, 2, 3 ]);
                done(null, 'bar');
            });
            server.listen(port);

            client = rpc.createClient(port);
            return client.request('foo', 1, 2, 3);
        }).then(([ response ]) => {
            expect(response).to.have.ordered.members([ 'bar' ]);
            done();
        }).catch(done);
    });

    it('should be empty when call without arguments', done => {
        portfinder.getPortPromise(option).then(port => {
            debug({ port });

            server = rpc.createServer().on('foo', (params, callback) => {
                expect(params).to.be.a('array').and.to.have.property('length', 0);
                callback(null, params.length);
            });
            server.listen(port);

            client = rpc.createClient(port);
            return new Promise((resolve, reject) => {
                client.request('foo', (error, response, msgid) => {
                    if (error) { reject(error); } else { resolve([ response, msgid ]); }
                });
            });
        }).then(([ response ]) => {
            expect(response).to.have.ordered.members([ 0 ]);
            done();
        }).catch(done);
    });

});

describe('msgpack-rpc#notify', () => {

    const option = { port: Number(process.env.npm_package_config_test_port || 9199) };
    let server;
    let client;

    afterEach(done => {
        client && client.close();
        client = null;
        server && server.close();
        server = null;
        done();
    });

    it('notify', done => {
        portfinder.getPortPromise(option).then(port => {
            debug({ port });

            server = rpc.createServer().on('qux', params => {
                expect(params).to.have.ordered.members([ 1, 2, 3 ]);
                done();
            });
            server.listen(port);

            client = rpc.createClient(port);
            client.notify('qux', 1, 2, 3);
        }).catch(done);
    });

});
