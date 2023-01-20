import { ConstructRemotes } from '@m-ld/m-ld';
import { BehaviorSubject } from 'rxjs';

// noinspection JSUnusedGlobalSymbols
export const DeadRemotes: ConstructRemotes = <any>(class {
  live = new BehaviorSubject(false);
  setLocal() {}
});