import type { Reference } from '@m-ld/m-ld';

export function idSet(refs: Reference[]) {
  return new Set(refs.map(ref => ref['@id']));
}

/**
 * Leaves an already-absolute URI alone
 */
export const domainRelativeIri = (iri: string, domainName: string) =>
  new URL(iri, `http://${domainName}`).toString();

/**
 *
 */
export function lastPathComponent(pathname: string) {
  return pathname.substring(pathname.lastIndexOf('/') + 1);
}
