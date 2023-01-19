import type { MeldClone, MeldReadState, MeldUpdate, Read, Write } from '@m-ld/m-ld';
import type { BackendLevel } from '../lib/index';
import { Results } from '../lib/index';
import { AbstractSublevel } from 'abstract-level';
import { EventEmitter, once } from 'events';
import { BehaviorSubject } from 'rxjs';

type JsonMeldUpdate = Omit<MeldUpdate, 'trace'>;

export interface SubdomainUpdate extends JsonMeldUpdate {
  /**
   * The number of times this update has been emitted. A number greater than one
   * indicates a timeout or restart has lead to uncertainty whether the update
   * was processed.
   */
  '@emitCount': number;
}

/**
 * Queue entries are indexed by end-tick as
 * `_gw:tick:${zeroPad(tick.toString(36), 8)}`. This gives a maximum tick of
 * 36^8, about 3 trillion, about 90 years in milliseconds.
 */
const TICK_KEY_LEN = 8;
const TICK_KEY_RADIX = 36;
const TICK_KEY_PAD = '0'.repeat(TICK_KEY_LEN);
export function tickKey(tick: number) {
  return `tick:${TICK_KEY_PAD.concat(tick.toString(TICK_KEY_RADIX)).slice(-TICK_KEY_LEN)}`;
}

/**
 * Mediates access to the given clone.
 *
 * Updates may be emitted by the `update` event, {@link poll} and {@link write},
 * which emit disjoint sets of updates under normal operation.
 */
export class SubdomainClone extends EventEmitter {
  private queueStore: AbstractSublevel<BackendLevel, unknown, string, any>;
  private state: BehaviorSubject<MeldReadState>;

  constructor(
    private readonly clone: MeldClone,
    backend: BackendLevel
  ) {
    super();
    this.queueStore = backend.sublevel('_gw:', { valueEncoding: 'json' });
    // Follow the clone to enqueue updates
    clone.follow(async (update, state) => {
      if (this.listenerCount('echo') > 0) {
        this.emit('echo', await this.enqueue(update));
      } else if (this.listenerCount('update') > 0) {
        // LOCKS the state if anyone is subscribed
        await this.doAndStayLocked(state, async () => {
          this.emit('update', await this.enqueue(update));
        });
      } else {
        // Nobody is listening, will hopefully poll
        await this.enqueue(update, false);
      }
    });
    this.state = new BehaviorSubject(clone);
  }

  private async enqueue(update: JsonMeldUpdate | SubdomainUpdate, emitting = true) {
    const emitCount = '@emitCount' in update ? update['@emitCount'] : 0;
    const subdomainUpdate: SubdomainUpdate = {
      ...update, '@emitCount': emitting ? emitCount + 1 : emitCount
    };
    await this.queueStore.put(tickKey(update['@ticks']), subdomainUpdate);
    return subdomainUpdate;
  }

  private async doAndStayLocked(state: MeldReadState, proc: () => Promise<unknown> | unknown) {
    this.state.next(state);
    // Start waiting for the lock before the proc
    const lockReleased = once(this, 'lockRelease'); // TODO timeout
    await proc();
    await lockReleased;
    this.state.next(this.clone);
  }

  get tick() {
    return this.clone.status.value.ticks;
  }

  /**
   * Report the update queue, incrementing the dequeue count.
   * LOCKS the state until a `lockRelease` event.
   */
  async *poll(): AsyncGenerator<SubdomainUpdate> {
    // Grab a read lock on the clone that waits for lockRelease
    await new Promise<void>(resolve =>
      this.clone.read(state =>
        this.doAndStayLocked(state, resolve)));
    for await (let [_key, update] of this.queueStore.iterator())
      // Re-enqueue the update with an incremented emit count
      yield this.enqueue(update);
  }

  /**
   * LOCKS the state until a `lockRelease` event.
   */
  write(request?: Write): Promise<SubdomainUpdate | null> {
    return new Promise((resolve, reject) => {
      this.clone.write(state => this.doAndStayLocked(state, async () => {
        if (request != null) {
          // Every write should produce one echo update or none.
          const beforeTick = this.tick;
          this.on('echo', resolve);
          try {
            this.state.next(await state.write(request));
            if (beforeTick === this.tick)
              resolve(null);
          } finally {
            // If clone tick not changed after write, cancel the expectation.
            if (beforeTick === this.tick)
              this.off('echo', resolve);
          }
        } else {
          resolve(null);
        }
      })).catch(reject);
    });
  }

  read<R extends Read>(request: R): Results {
    return this.state.value.read(request).consume;
  }

  async unlock() {
    await this.queueStore.clear();
    this.emit('lockRelease');
  }
}