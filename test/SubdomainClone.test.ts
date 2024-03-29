import { clone as meldClone, Describe, MeldClone } from '@m-ld/m-ld';
import { MemoryLevel } from 'memory-level';
import { firstValueFrom } from 'rxjs';
import { SubdomainClone, SubdomainUpdate } from '../src/server/SubdomainClone.js';
import { setTimeout } from 'timers/promises';
import { once } from 'events';
import { DeadRemotes } from './fixtures.js';

describe('Subdomain clone', () => {
  let clone: MeldClone;
  let sdc: SubdomainClone;

  beforeEach(async () => {
    const backend = new MemoryLevel;
    clone = await meldClone(backend, DeadRemotes, {
      '@id': 'test', '@domain': 'test.acc.ex.org', genesis: true
    });
    sdc = new SubdomainClone({ account: 'acc', name: 'test' }, clone, backend);
  });

  test('initialises unlocked', () => {
    expect(sdc.locked).toBe(false);
  });

  test('poll for an update', async () => {
    // Using an unmanaged local write to simulate a remote update
    await clone.write({ '@id': 'fred', name: 'Fred' });
    expect.hasAssertions();
    for await (let update of sdc.poll()) {
      expect(update).toMatchObject({
        '@insert': [{ '@id': 'fred', name: 'Fred' }],
        '@emitCount': 1
      });
    }
    expect(sdc.locked).toBe(true);
    await sdc.unlock();
  });

  test('polling blocks write until unlock', async () => {
    for await (let update of sdc.poll()) {}
    const willWrite = clone.write({ '@id': 'fred', name: 'Fred' });
    await expect(Promise.race([
      willWrite, setTimeout(10, 'timeout')
    ])).resolves.toBe('timeout');
    await sdc.unlock();
    await expect(willWrite).resolves.toBeDefined();
  });

  test('polling increments emit count', async () => {
    await clone.write({ '@id': 'fred', name: 'Fred' });
    for await (let update of sdc.poll()) {}
    expect.hasAssertions();
    for await (let update of sdc.poll()) {
      expect(update['@emitCount']).toBe(2);
    }
    await sdc.unlock();
  });

  test('write gets update', async () => {
    await expect(sdc.write({ '@id': 'fred', name: 'Fred' }).then(jsonify))
      .resolves.toMatchObject({
        '@insert': [{ '@id': 'fred', name: 'Fred' }],
        '@emitCount': 1
      });
    expect(sdc.locked).toBe(true);
    await sdc.unlock();
  });

  test('empty write returns null', async () => {
    await expect(sdc.write()).resolves.toBeNull();
    expect(sdc.locked).toBe(true);
    await sdc.unlock();
  });

  test('write blocks external write until unlock', async () => {
    await sdc.write({ '@id': 'wilma', name: 'Wilma' });
    const willWrite = clone.write({ '@id': 'fred', name: 'Fred' });
    await expect(Promise.race([
      willWrite, setTimeout(10, 'timeout')
    ])).resolves.toBe('timeout');
    await sdc.unlock();
    await expect(willWrite).resolves.toBeDefined();
  });

  test('can write multiple before unlock', async () => {
    await sdc.write({ '@id': 'wilma', name: 'Wilma' });
    expect(sdc.locked).toBe(true);
    await sdc.write({ '@id': 'fred', name: 'Fred' });
    expect(sdc.tick).toBe(2);
    await sdc.unlock();
  });

  test('read gets write before unlock', async () => {
    await sdc.write({ '@id': 'fred', name: 'Fred' });
    expect(sdc.tick).toBe(1);
    expect(sdc.locked).toBe(true);
    await expect(firstValueFrom(sdc.state.read<Describe>({ '@describe': 'fred' })))
      .resolves.toMatchObject({ name: 'Fred' });
    await sdc.unlock();
  });

  test('subscriber receives update', async () => {
    const willUpdate = once(sdc, 'update');
    await clone.write({ '@id': 'fred', name: 'Fred' });
    await expect(willUpdate.then(jsonify)).resolves.toMatchObject([{
      '@insert': [{ '@id': 'fred', name: 'Fred' }],
      '@emitCount': 1
    }]);
    expect(sdc.locked).toBe(true);
    await sdc.unlock();
  });

  test('subscriber must unlock between updates', async () => {
    const willUpdateSecond = new Promise<void>(resolve => sdc.on(
      'update', (update: SubdomainUpdate) => {
        if (update['@ticks'] === 2)
          resolve();
      }));
    await clone.write({ '@id': 'fred', name: 'Fred' });
    clone.write({ '@id': 'wilma', name: 'Wilma' }).catch();
    await expect(Promise.race([
      willUpdateSecond, setTimeout(10, 'timeout')
    ])).resolves.toBe('timeout');
    await sdc.unlock();
    await expect(willUpdateSecond).resolves.toBeUndefined();
  });
});

function jsonify(thing: any) {
  return JSON.parse(JSON.stringify(thing));
}
