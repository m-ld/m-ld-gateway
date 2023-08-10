import { fileURLToPath } from 'url';
import { fetchBuilder, FileSystemCache } from 'node-fetch-cache';
import { from, map, mergeMap } from 'rxjs';

const fetch = fetchBuilder.withCache(new FileSystemCache({
  cacheDirectory: fileURLToPath(new URL('swapi-cache', import.meta.url))
}));

export const context = {
  '@base': 'https://swapi.dev/api/',
  '@vocab': 'https://swapi.dev/#',
  films: { '@type': '@id' },
  homeworld: { '@type': '@id' },
  species: { '@type': '@id' },
  starships: { '@type': '@id' },
  vehicles: { '@type': '@id' },
  planets: { '@type': '@id' },
  characters: { '@type': '@id' },
};

/**
 * Fetches an observable stream of resources of a particular type from the [Star
 * Wars API](https://swapi.dev/) (with aggressive caching, see `fetch` above).
 */
export function resource(type) {
  return from(fetch(`https://swapi.dev/api/${type}/`)
    .then(res => res.json())
    .then(json => json.results)
  ).pipe(
    mergeMap(from),
    map(resource => ({ ...resource, '@id': resource.url }))
  );
}