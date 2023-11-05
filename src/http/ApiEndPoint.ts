import { EndPoint, get } from './EndPoint.js';
import { plugins, Request, Response, Server as RestServer } from 'restify';
import { Gateway } from '../server/index.js';
import { domainRelativeIri } from '../lib/index.js';
import { gatewayContext } from '../data/index.js';

export class ApiEndPoint extends EndPoint<RestServer> {
  constructor(readonly gateway: Gateway, server: RestServer) {
    super(server, '/api/v1', ({ useFor }) => {
      useFor('put', plugins.bodyParser());
      useFor('post', plugins.bodyParser());
      useFor('patch', plugins.bodyParser());
    });
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
  async getPublicKey(_req: Request, res: Response) {
    res.contentType = 'application/x-pem-file';
    res.send(this.gateway.me.userKey.getCryptoPublicKey());
  }
}