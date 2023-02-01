import { EndPoint, HasContext } from './EndPoint.js';
import { plugins, Request, Server as RestServer } from 'restify';
import { Gateway } from '../server/index.js';
import { domainRelativeIri } from '../lib/index.js';
import { gatewayContext } from '../data/index.js';
import { NotFoundError } from './errors.js';

export type GatewayRequest = Request & HasContext<'server', RestServer>;

export class GatewayEndPoint extends EndPoint<RestServer> {
  constructor(readonly gateway: Gateway, server: RestServer) {
    super(server, '/api/v1');

    this.use((req: GatewayRequest) => req.set('server', server));

    this.useFor('put', plugins.bodyParser());
    this.useFor('post', plugins.bodyParser());

    this.get('/context', async (req, res) => {
      res.contentType = req.accepts('html') ? 'html' : 'application/ld+json';
      res.send({
        '@base': domainRelativeIri('/', gateway.domainName),
        ...gatewayContext // TODO: actual gateway context
      });
    });

    this.get('/publicKey', async (req, res) => {
      if (!gateway.usingUserKeys)
        throw new NotFoundError();
      res.contentType = 'text';
      res.send(gateway.me.userKey!.getCryptoPublicKey().export({
        format: 'pem', type: 'spki'
      }));
    });
  }
}