import { EndPoint, post } from './EndPoint';
import { GatewayEndPoint } from './GatewayEndPoint';
import { Response } from 'restify';
import { SubdomainRequest } from './SubdomainEndPoint';
import { MethodNotAllowedError } from './errors';
import { Account } from '../server/index';
import { uuid } from '@m-ld/m-ld';

export class DomainEndPoint extends EndPoint<GatewayEndPoint> {
  constructor(outer: GatewayEndPoint) {
    super(outer, '/domain/:account');
  }

  get gateway() {
    return this.outer.gateway;
  }

  @post
  async postSubdomain(req: SubdomainRequest, res: Response) {
    const { account } = req.params;
    if (!(await Account.hasAnonymousAccess(this.gateway, { account })))
      throw new MethodNotAllowedError('Unable to generate name; use PUT');
    res.send(await this.gateway.subdomainConfig({ account, name: uuid() }));
  }
}