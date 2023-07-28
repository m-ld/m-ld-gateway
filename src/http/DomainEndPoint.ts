import { EndPoint, post } from './EndPoint.js';
import { ApiEndPoint } from './ApiEndPoint.js';
import { Request, Response } from 'restify';
import { MethodNotAllowedError } from './errors.js';
import { Account } from '../server/index.js';
import { uuid } from '@m-ld/m-ld';

export class DomainEndPoint extends EndPoint<ApiEndPoint> {
  constructor(outer: ApiEndPoint) {
    super(outer, '/domain/:account');
  }

  get gateway() {
    return this.outer.gateway;
  }

  @post
  async postSubdomain(req: Request, res: Response) {
    const { account } = req.params;
    const naming = await Account.getDetails(this.gateway.domain, account, 'naming');
    if (!naming.includes('uuid'))
      throw new MethodNotAllowedError('Unable to generate name; use PUT');
    res.send(await this.gateway.subdomainConfig({ account, name: uuid() }, 'uuid'))
  }
}