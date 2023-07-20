import type { Subject } from '@m-ld/m-ld';
import { Subdomain } from '../data/Subdomain.js';

export const accountHasSubdomain = (sd: Subdomain): Subject => ({
  '@id': sd.account, subdomain: sd.toJSON()
});

export const userIsAdmin = (user: string, account: string): Subject => ({
  '@id': account, 'vf:primaryAccountable': { '@id': user }
});