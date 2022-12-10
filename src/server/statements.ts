import type { AccountOwnedId } from '../lib/index';
import type { Subject } from '@m-ld/m-ld';

export const accountHasSubdomain = (tsId: AccountOwnedId): Subject => ({
  '@id': tsId.account, subdomain: { '@id': tsId.toIri() }
});

export const userIsAdmin = (user: string, account: string): Subject => ({
  '@id': account, 'vf:primaryAccountable': { '@id': user }
});