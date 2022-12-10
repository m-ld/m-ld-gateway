import { AccountOwnedId, AuthKey, verifyJwt } from '../lib';
import { UserKey } from '../data';
import { UnauthorizedError } from '../http/errors';
import type { Request } from 'restify';
import { Gateway } from './Gateway';
import { JwtPayload } from 'jsonwebtoken';

export interface AccessRequest {
  /** An ID for which access is requested */
  id: AccountOwnedId;
  /**
   * Type of the `id`, requested for write. If not specified, this request is
   * for read-only.
   */
  forWrite?: string;
}

export class Authorization {
  private readonly user: string;
  private readonly jwt?: string;
  private readonly key?: string;

  static fromRequest(req: Request) {
    if (req.authorization == null)
      throw new UnauthorizedError();
    const user = req.params.user || req.authorization.basic?.username;
    switch (req.authorization.scheme) {
      case 'Bearer':
        return new Authorization({
          user, jwt: req.authorization.credentials
        });
      case 'Basic':
        return new Authorization({
          user, key: req.authorization.basic?.password
        });
      default:
        throw new UnauthorizedError('Unrecognised authorization');
    }
  }

  /**
   * @param {string} user
   * @param {string} [jwt] a JWT containing a keyid associated with this Account
   * @param {string} [key] an authorisation key associated with this Account
   */
  constructor({ user, jwt, key }: { user: string, jwt?: string, key?: string }) {
    if (!AccountOwnedId.isComponentId(user))
      throw new UnauthorizedError('Bad user %s', user);
    if (!jwt && !key)
      throw new UnauthorizedError('No user credentials presented');
    this.user = user;
    this.jwt = jwt;
    this.key = key;
  }

  /**
   * @param gateway
   * @param [access] a timesheet or project access request
   * @returns {Promise<{ acc: Account, keyid: string }>}
   */
  async verifyUser(gateway: Gateway, access?: AccessRequest) {
    const userAcc = await gateway.account(this.user);
    if (userAcc == null)
      throw new UnauthorizedError('Not found: %s', this.user);
    let keyid: string;
    if (this.jwt) {
      try { // Verify the JWT against its declared keyid
        let payload: JwtPayload;
        if (gateway.usingUserKeys) {
          // Asymmetric user keys
          payload = await UserKey.verifyJwt(this.jwt, async header => {
            const userKey = await userAcc.authorise(header.kid!, access);
            if (userKey instanceof UserKey) {
              keyid = userKey.keyid;
              return userKey;
            } else {
              throw new RangeError('Expecting a user key');
            }
          });
        } else {
          // Symmetric secret
          payload = await verifyJwt(this.jwt, async header => {
            const authKey = await userAcc.authorise(header.kid!, access);
            if (authKey instanceof AuthKey) {
              keyid = authKey.keyid;
              return authKey.secret;
            } else {
              throw new RangeError('Expecting a secret');
            }
          });
        }
        if (payload.sub !== this.user)
          return Promise.reject(new UnauthorizedError('JWT does not correspond to user'));
      } catch (e) {
        throw new UnauthorizedError(e);
      }
    } else if (this.key) {
      const authKey = AuthKey.fromString(this.key);
      const userKey = await userAcc.authorise(authKey.keyid, access);
      keyid = userKey.keyid;
      if (!userKey.matches(authKey))
        throw new UnauthorizedError();
    } else {
      throw new UnauthorizedError('No user credentials available');
    }
    return { acc: userAcc, keyid: keyid! };
  }
}