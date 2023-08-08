import { clone, uuid } from '@m-ld/m-ld';
import { MemoryLevel } from 'memory-level';
import { IoRemotes } from '@m-ld/m-ld/ext/socket.io';
import { isMainThread, Worker, workerData } from 'worker_threads';
import { setTimeout } from 'timers/promises';
import * as swapi from './swapi.js';
import { delayWhen, interval } from 'rxjs';
import { faker } from '@faker-js/faker/locale/en';

export class SwapiUser extends Worker {
  /**
   * @param {import('@m-ld/m-ld').MeldConfig} config
   * @param {'films' | 'people' | 'planets' | 'species' | 'starships' | 'vehicles'} resourceType
   * @param {import('fs').WriteStream} stdout
   */
  constructor(config, resourceType, stdout) {
    const cloneId = uuid();
    super(new URL(import.meta.url), {
      workerData: {
        config: {
          '@id': cloneId,
          '@context': swapi.context,
          ...config
        },
        resourceType
      }, stdout: true
    });
    this.cloneId = cloneId;
    this.stdout.pipe(stdout, { end: false });
  }
}

if (!isMainThread) {
  const { config, resourceType } = workerData;
  const cloneId = config['@id'];
  console.log(cloneId, 'processing', resourceType);

  const meld = await clone(new MemoryLevel(), IoRemotes, config);
  console.log(cloneId, 'cloned');

  await meld.status.becomes({ outdated: false });
  console.log(cloneId, 'up to date');

  await swapi.resource(resourceType)
    .pipe(delayWhen(() =>
      interval(faker.number.int({ max: 10 }))))
    .forEach(film => meld.write(film));
  console.log(cloneId, 'loaded data');

  await setTimeout(1000);

  await meld.close();
  console.log(cloneId, 'closed, will exit');
}