import { EndPoint, post } from './EndPoint.js';
import { ApiEndPoint } from './ApiEndPoint.js';
import { Request, Response } from 'restify';
import { MethodNotAllowedError } from './errors.js';
import { Account, Authorization } from '../server/index.js';
import { uuid } from '@m-ld/m-ld';
import { AccountOwnedId, asUuid, matches, validate } from '../lib/index.js';
import { as } from '../lib/validate.js';

export class DomainEndPoint extends EndPoint<ApiEndPoint> {
  constructor(outer: ApiEndPoint) {
    super(outer, '/domain/:account');
  }

  get gateway() {
    return this.outer.gateway;
  }

  /**
   * Tries to ensure that the account has a subdomain. Intended primarily for
   * obtaining configuration for UUID subdomains.
   *
   * When used for named subdomains, this end-point has a possible ambiguity if
   * the requested name happens to be a UUID and the account happens to allow
   * UUID subdomains; in which case a UUID configuration is returned instead of
   * creating a named subdomain. To be sure of named subdomain creation, clients
   * should use PUT on the subdomain end-point.
   */
  @post
  async postSubdomain(req: Request, res: Response) {
    const { account } = req.params;
    const { name, useSignatures } = validate(req.body ?? {}, as.object({
      name: AccountOwnedId.asComponentId.optional(),
      useSignatures: as.boolean().optional()
    }));
    const allowsUuidSubdomains =
      await Account.allowsUuidSubdomains(this.gateway.domain, account);
    if (!name) {
      if (!allowsUuidSubdomains)
        throw new MethodNotAllowedError('Unable to generate name; use PUT');
      const id = this.gateway.ownedId({ account, name: uuid() });
      return res.json(await this.gateway.getSubdomainConfig(id, true));
    } else {
      // Requesting a specific name. If UUID, provide config, with potentially
      // undefined genesis. Otherwise, require authorization and create named.
      const id = this.gateway.ownedId({ account, name });
      if (allowsUuidSubdomains && matches(name, asUuid)) {
        return res.json(await this.gateway.getSubdomainConfig(id));
      } else {
        const who = await Authorization.fromRequest(req)
          .verifyUser(this.gateway, { id, forWrite: 'Subdomain' });
        return res.json(await this.gateway.ensureNamedSubdomain({
          useSignatures, account, name
        }, who));
      }
    }
  }
}