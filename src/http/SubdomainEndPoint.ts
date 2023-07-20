import { EndPoint, HasContext, post, put, sendChunked, use } from './EndPoint.js';
import { GatewayEndPoint } from './GatewayEndPoint.js';
import { Authorization, Who } from '../server/index.js';
import { AccountOwnedId, as, validate } from '../lib/index.js';
import { BadRequestError, NotFoundError } from './errors.js';
import { consume } from 'rx-flowable/consume';
import { Readable } from 'stream';
import { SubdomainClone } from '../server/SubdomainClone.js';
import { Request, Response } from 'restify';

export type SubdomainRequest = Request &
  HasContext<'id', AccountOwnedId> &
  HasContext<'who', Who>;

export class SubdomainEndPoint extends EndPoint<GatewayEndPoint> {
  constructor(outer: GatewayEndPoint) {
    super(outer, '/domain/:account/:name');
  }

  get gateway() {
    return this.outer.gateway;
  }

  @use
  bindSubdomainId(req: SubdomainRequest) {
    try {
      req.set('id', this.gateway.ownedId(req.params).validate());
    } catch (e) {
      // ownedId throws strings
      throw new BadRequestError('Bad domain %s', req.params);
    }
  }

  @use
  async bindAuthorisedWho(req: SubdomainRequest) {
    const auth = Authorization.fromRequest(req);
    req.set('who', await auth.verifyUser(this.gateway, {
      id: req.get('id'), forWrite: req.isUpload() ? 'Subdomain' : undefined
    }));
  }

  @put
  async putSubdomain(req: SubdomainRequest, res: Response) {
    const { useSignatures } = validate(req.body ?? {}, as.object({
      useSignatures: as.boolean().optional()
    }));
    const { account, name } = req.get('id');
    res.json(await this.gateway.subdomainConfig({
      useSignatures, account, name
    }, 'any', req.get('who')));
  }

  @post('/poll')
  async pollUpdates(req: SubdomainRequest, res: Response) {
    const sd = await this.gateway.getSubdomain(req.get('id'));
    if (sd == null)
      throw new NotFoundError;
    res.setHeader('ETag', this.etag(sd));
    res.setHeader('Location', this.lockUrl(req));
    await sendChunked(res, consume(Readable.from(sd.poll())), 201);
  }

  lockUrl(req: SubdomainRequest) {
    const id = req.get('id');
    return `/domain/${id.account}/${id.name}/state?lock`;
  }

  etag(sd: SubdomainClone) {
    return `"${sd.tick}"`;
  }
}