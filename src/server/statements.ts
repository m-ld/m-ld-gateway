import type { Subject } from '@m-ld/m-ld';

export const userIsAdmin = (user: string, account: string): Subject => ({
  '@id': account, 'vf:primaryAccountable': { '@id': user }
});