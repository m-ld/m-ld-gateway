import { EndPoint, get } from './EndPoint.js';
import { plugins, Request, Response, Server as RestServer } from 'restify';
import { Gateway } from '../server/index.js';
import { domainRelativeIri } from '../lib/index.js';
import { gatewayContext } from '../data/index.js';
import { NotFoundError } from './errors.js';

export class GatewayEndPoint extends EndPoint<RestServer> {
  constructor(readonly gateway: Gateway, server: RestServer) {
    super(server, '/api/v1');
    this.useFor('put', plugins.bodyParser());
    this.useFor('post', plugins.bodyParser());
    this.useFor('patch', plugins.bodyParser());
  }

  @get('/context')
  async getContext(req: Request, res: Response) {
    res.contentType = req.accepts('html') ? 'html' : 'application/ld+json';
    res.send({
      '@base': domainRelativeIri('/', this.gateway.domainName),
      ...gatewayContext // TODO: actual gateway context
    });
  }

  @get('/publicKey')
  async getPublicKey(req: Request, res: Response) {
    if (!this.gateway.usingUserKeys)
      throw new NotFoundError();
    res.contentType = 'text';
    res.send(this.gateway.me.userKey!.getCryptoPublicKey().export({
      format: 'pem', type: 'spki'
    }));
  }
}