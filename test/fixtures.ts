import { clone as meldClone, ConstructRemotes, MeldClone } from '@m-ld/m-ld';
import { BehaviorSubject } from 'rxjs';
import { mock, MockProxy } from 'jest-mock-extended';
import { BackendLevel, CloneFactory, Env } from '../src/index';
import { MemoryLevel } from 'memory-level';
import { DirResult, dirSync } from 'tmp';
import { join } from 'path';

// noinspection JSUnusedGlobalSymbols
export const DeadRemotes: ConstructRemotes = <any>(class {
  live = new BehaviorSubject(false);
  setLocal() {}
});

export function parseNdJson(text: string) {
  return text ? text.split('\n').map(json => JSON.parse(json)) : [];
}

export type TestCloneFactory = MockProxy<CloneFactory> & { clones: Record<string, MeldClone> };
export function testCloneFactory(remotes = DeadRemotes): TestCloneFactory {
  const cloneFactory = mock<CloneFactory>();
  const clones: Record<string, MeldClone> = {};
  cloneFactory.clone.mockImplementation(async (config): Promise<[MeldClone, BackendLevel]> => {
    const backend = new MemoryLevel;
    const clone = await meldClone(backend, remotes, config);
    clones[config['@domain']] = clone;
    return [clone, backend];
  });
  return Object.assign(cloneFactory, { clones });
}

export class TestEnv extends Env {
  tmpDir: DirResult;

  constructor() {
    const tmpDir = dirSync({ unsafeCleanup: true });
    super('app', { data: join(tmpDir.name, 'data') });
    this.tmpDir = tmpDir;
  }

  tearDown() {
    this.tmpDir.removeCallback();
  }
}