/** TODO: export from m-ld */
export type Iri = string;

export { UserKey } from './UserKey.js';

export const $vocab = 'http://gw.m-ld.org/#';

export const gatewayContext = {
  '@vocab': $vocab,
  naming: { '@type': '@vocab' },
  remotesAuth: { '@type': '@vocab' }
};

/**
 * Obtains absolute IRIs in the Gateway vocabulary
 * @returns {string}
 */
export const gatewayVocab = (iri: Iri) => `${$vocab}${iri}`;
