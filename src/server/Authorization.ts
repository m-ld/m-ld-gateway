import { AccountOwnedId, AuthKey, lastPathComponent } from '../lib/index.js';
import { Iri, UserKey } from '../data/index.js';
import { UnauthorizedError } from '../http/errors.js';
import type { Request } from 'restify';
import { Gateway } from './Gateway.js';
import { decode } from 'jsonwebtoken';
import { Account } from './Account.js';

export interface AccessRequest {
  /** An ID for which access is requested */
  id: AccountOwnedId;
  /**
   * Type of the `id`, requested for write. If not specified, this request is
   * for read-only.
   */
  forWrite?: string;
}

/**
 * A security principal in the Gateway in the context of a session. When a `Who`
 * is used in the code, we should already have authenticated and authorised the
 * account and user, as required.
 */
export interface Who {
  readonly acc: Account,
  /**
   * The full account auth key may or may not be known in a session context.
   */
  readonly key: { keyid: string } | AuthKey,
  /**
   * An end-user. This may not be the account, if the application is providing
   * its own access control. If the @id is relative, it will be resolved against
   * the Gateway domain.
   */
  readonly user?: { '@id': Iri, key?: UserKey }
}

export abstract class Authorization {
  /** Available if the authorization includes the user's auth key */
  authKey?: AuthKey;

  static fromRequest(req: Request) {
    if (req.authorization == null)
      throw new UnauthorizedError;
    switch (req.authorization.scheme) {
      case 'Bearer':
        return new JwtAuthorization(req.authorization.credentials);
      case 'Basic':
        const { username, password } = req.authorization.basic!;
        return new KeyAuthorization(username, password);
      default:
        throw new UnauthorizedError('Unrecognised authorization');
    }
  }

  /**
   * @param gateway
   * @param [access] a timesheet or project access request
   * @returns {}
   */
  abstract verifyUser(gateway: Gateway, access?: AccessRequest): Promise<Who>;

  protected async getUserAccount(gateway: Gateway, user: string) {
    // Check for an absolute user URI e.g. http://gateway/name
    const name = lastPathComponent(user);
    if (!AccountOwnedId.isComponentId(name) ||
      (user !== name && user !== gateway.absoluteId(name)))
      throw new UnauthorizedError('Bad user: %s', user);
    const userAcc = await gateway.account(name);
    if (userAcc == null)
      throw new UnauthorizedError('Not found: %s', user);
    return userAcc;
  }
}

export class KeyAuthorization extends Authorization {
  readonly authKey: AuthKey;

  /**
   * @param user
   * @param key an authorisation key associated with this Account
   */
  constructor(
    private readonly user: string,
    key: string
  ) {
    super();
    this.authKey = AuthKey.fromString(key);
  }

  async verifyUser(gateway: Gateway, access?: AccessRequest) {
    const userAcc = await this.getUserAccount(gateway, this.user);
    const userKey = await userAcc.authorise(this.authKey.keyid, access);
    if (!userKey.matches(this.authKey))
      throw new UnauthorizedError;
    return { acc: userAcc, key: this.authKey };
  }
}

export class JwtAuthorization extends Authorization {
  /** @param jwt a JWT containing a keyid associated with this Account */
  constructor(
    private readonly jwt: string
  ) {
    super();
  }

  async verifyUser(gateway: Gateway, access?: AccessRequest): Promise<Who> {
    const payload = decode(this.jwt, { json: true });
    if (payload?.iss == null)
      throw new UnauthorizedError('Missing JWT issuer identity');
    const userAcc = await this.getUserAccount(gateway, payload.iss);
    let keyid: string;
    try { // Verify the JWT against its declared keyid
      await UserKey.verifyJwt(this.jwt, async header =>
        userAcc.authorise(keyid = header.kid!, access));
    } catch (e) {
      throw new UnauthorizedError(e);
    }
    return { acc: userAcc, key: { keyid: keyid! } };
  }
}