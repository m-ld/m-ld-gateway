/** TODO: export from m-ld */
export type Iri = string;

export { UserKey } from './UserKey';

export const gatewayContext = {
  '@vocab': 'http://gw.m-ld.org/#'
};

/**
 * Obtains absolute IRIs in the Timeld vocabulary
 * @returns {string}
 */
export const gatewayVocab = (iri: Iri) => `${gatewayContext['@vocab']}${iri}`;
