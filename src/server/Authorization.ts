import { AccountOwnedId, AuthKey, verifyJwt } from '../lib/index.js';
import { UserKey } from '../data/index.js';
import { UnauthorizedError } from '../http/errors.js';
import type { Request } from 'restify';
import { Gateway } from './Gateway.js';
import { decode } from 'jsonwebtoken';
import { Account } from './Account';

export interface AccessRequest {
  /** An ID for which access is requested */
  id: AccountOwnedId;
  /**
   * Type of the `id`, requested for write. If not specified, this request is
   * for read-only.
   */
  forWrite?: string;
}

export abstract class Authorization {
  static fromRequest(req: Request) {
    if (req.authorization == null)
      throw new UnauthorizedError();
    switch (req.authorization.scheme) {
      case 'Bearer':
        return new BearerAuthorization(req.authorization.credentials);
      case 'Basic':
        const { username, password } = req.authorization.basic!;
        return new BasicAuthorization(username, password);
      default:
        throw new UnauthorizedError('Unrecognised authorization');
    }
  }

  /**
   * @param gateway
   * @param [access] a timesheet or project access request
   * @returns {}
   */
  abstract verifyUser(
    gateway: Gateway,
    access?: AccessRequest
  ): Promise<{ acc: Account, keyid: string }>;

  protected async getUserAccount(gateway: Gateway, user: string) {
    if (!AccountOwnedId.isComponentId(user))
      throw new UnauthorizedError('Bad user %s', user);
    const userAcc = await gateway.account(user);
    if (userAcc == null)
      throw new UnauthorizedError('Not found: %s', user);
    return userAcc;
  }
}

export class BasicAuthorization extends Authorization {
  /**
   * @param user
   * @param key an authorisation key associated with this Account
   */
  constructor(
    private readonly user: string,
    private readonly key: string
  ) {
    super();
  }

  async verifyUser(gateway: Gateway, access?: AccessRequest) {
    const userAcc = await this.getUserAccount(gateway, this.user);
    const authKey = AuthKey.fromString(this.key);
    const userKey = await userAcc.authorise(authKey.keyid, access);
    if (!userKey.matches(authKey))
      throw new UnauthorizedError();
    return { acc: userAcc, keyid: userKey.keyid };
  }
}

export class BearerAuthorization extends Authorization {
  /** @param jwt a JWT containing a keyid associated with this Account */
  constructor(
    private readonly jwt: string
  ) {
    super();
  }

  async verifyUser(gateway: Gateway, access?: AccessRequest) {
    const payload = decode(this.jwt, { json: true });
    if (payload?.sub == null)
      throw new UnauthorizedError('Missing user identity');
    const userAcc = await this.getUserAccount(gateway, payload.sub);
    let keyid: string;
    try { // Verify the JWT against its declared keyid
      if (gateway.usingUserKeys) {
        // Asymmetric user keys
        await UserKey.verifyJwt(this.jwt, async header => {
          const userKey = await userAcc.authorise(keyid = header.kid!, access);
          if (userKey instanceof UserKey)
            return userKey;
          else
            throw new RangeError('Expecting a user key');
        });
      } else {
        // Symmetric secret
        await verifyJwt(this.jwt, async header => {
          const authKey = await userAcc.authorise(keyid = header.kid!, access);
          if (authKey instanceof AuthKey)
            return authKey.secret;
          else
            throw new RangeError('Expecting a secret');
        });
      }
    } catch (e) {
      throw new UnauthorizedError(e);
    }
    return { acc: userAcc, keyid: keyid! };
  }
}