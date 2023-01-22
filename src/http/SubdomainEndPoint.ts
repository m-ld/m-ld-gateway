import { EndPoint, HasContext, sendChunked } from './EndPoint';
import { GatewayEndPoint, GatewayRequest } from './GatewayEndPoint';
import { Gateway } from '../server/index';
import { AccountOwnedId } from '../lib/index';
import { BadRequestError } from './errors';
import { Authorization } from '../server/Authorization';
import { Who } from '../server/Gateway';
import { consume } from 'rx-flowable/consume';
import { Readable } from 'stream';
import { SubdomainClone } from '../server/SubdomainClone';

export type SubdomainRequest = GatewayRequest &
  HasContext<'id', AccountOwnedId> &
  HasContext<'who', Who>;

export class SubdomainEndPoint extends EndPoint<GatewayEndPoint> {
  readonly gateway: Gateway;

  constructor(outer: GatewayEndPoint) {
    super(outer, '/domain/:account/:name');
    this.gateway = outer.gateway;

    this.use((req: SubdomainRequest) => {
      const { account, name }: { account: string, name: string } = req.params;
      try {
        req.set('id', this.gateway.ownedId(account, name).validate());
      } catch (e) {
        // ownedId throws strings
        throw new BadRequestError('Bad domain %s/%s', account, name);
      }
    });

    this.use(async (req: SubdomainRequest) => {
      const auth = Authorization.fromRequest(req);
      req.set('who', await auth.verifyUser(this.gateway, {
        id: req.get('id'),
        forWrite: req.isUpload() ? 'Subdomain' : undefined
      }));
    });

    this.put('', async (req: SubdomainRequest, res) =>
      res.json(await this.gateway.subdomainConfig(req.get('id'), req.get('who'))));

    this.post('/poll', async (req: SubdomainRequest, res) => {
      const sd = await this.gateway.getSubdomain(req.get('id'));
      res.setHeader('ETag', this.etag(sd));
      res.setHeader('Location', this.lockUrl(req));
      await sendChunked(res, consume(Readable.from(sd.poll())), 201);
    });
  }

  lockUrl(req: SubdomainRequest) {
    const id = req.get('id');
    return `/domain/${id.account}/${id.name}/state?lock`;
  }

  etag(sd: SubdomainClone) {
    return `"${sd.tick}"`;
  }
}