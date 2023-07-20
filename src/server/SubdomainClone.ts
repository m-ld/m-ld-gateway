import type { MeldClone, MeldReadState, MeldState, MeldUpdate, Write } from '@m-ld/m-ld';
import type { BackendLevel } from '../lib/index.js';
import { AbstractSublevel } from 'abstract-level';
import { EventEmitter, once } from 'events';
import { Subdomain, SubdomainSpec } from '../data/Subdomain.js';

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

type CloneState =
  { state: MeldReadState, lock?: 'read' } |
  { state: MeldState, lock: 'write' };

/**
 * Mediates access to the given clone.
 *
 * Updates may be emitted by the `update` event, {@link #poll} and {@link #write},
 * which emit disjoint sets of updates under normal operation.
 */
export class SubdomainClone extends Subdomain {
  private readonly queueStore: AbstractSublevel<BackendLevel, unknown, string, any>;
  private _state: CloneState;
  private events = new EventEmitter;

  constructor(
    spec: SubdomainSpec,
    private readonly _clone: MeldClone,
    backend: BackendLevel
  ) {
    super(spec);
    this.queueStore = backend.sublevel('_gw:', { valueEncoding: 'json' });
    // Follow the clone to enqueue updates
    _clone.follow(async (update, state) => {
      if (this.events.listenerCount('echo') > 0) {
        this.events.emit('echo', await this.enqueue(update));
      } else if (this.events.listenerCount('update') > 0) {
        // LOCKS the state if anyone is subscribed
        await this.doAndStayLocked({ state }, async () => {
          this.events.emit('update', await this.enqueue(update));
        });
      } else {
        // Nobody is listening, will hopefully poll
        await this.enqueue(update, false);
      }
    });
    this._state = { state: _clone };
  }

  on(eventName: 'echo', listener: (sdu: SubdomainUpdate) => void): this;
  on(eventName: 'update', listener: (sdu: SubdomainUpdate) => void): this;
  on(eventName: 'lockRelease', listener: () => void): this;
  on(eventName: string, listener: (...args: any[]) => void) {
    this.events.on(eventName, listener);
    return this;
  }

  // noinspection JSUnusedGlobalSymbols - implements _NodeEventTarget
  once(eventName: string, listener: (...args: any[]) => void) {
    this.events.once(eventName, listener);
    return this;
  }

  /** Getter omits state, which is managed by this class */
  get clone(): Omit<MeldClone, keyof MeldState> {
    return this._clone;
  }

  get state(): MeldReadState {
    return this._state.state;
  }

  private async enqueue(update: JsonMeldUpdate | SubdomainUpdate, emitting = true) {
    const emitCount = '@emitCount' in update ? update['@emitCount'] : 0;
    const subdomainUpdate: SubdomainUpdate = {
      ...update, '@emitCount': emitting ? emitCount + 1 : emitCount
    };
    await this.queueStore.put(tickKey(update['@ticks']), subdomainUpdate);
    return subdomainUpdate;
  }

  private async doAndStayLocked(state: CloneState, proc: () => Promise<unknown> | unknown) {
    this._state = { lock: 'read', ...state };
    // Start waiting for the lock before the proc
    const lockReleased = once(this.events, 'lockRelease'); // TODO timeout
    await proc();
    await lockReleased;
    this._state = { state: this._clone };
  }

  get tick() {
    return this._clone.status.value.ticks;
  }

  /**
   * Report the update queue, incrementing the dequeue count.
   * LOCKS the state until a `lockRelease` event.
   */
  async *poll(): AsyncGenerator<SubdomainUpdate> {
    // Grab a read lock on the clone that waits for lockRelease
    await new Promise<void>(resolve =>
      this._clone.read(state =>
        this.doAndStayLocked({ state }, resolve)));
    for await (let [_key, update] of this.queueStore.iterator())
      // Re-enqueue the update with an incremented emit count
      yield this.enqueue(update);
  }

  /**
   * LOCKS the state until a `lockRelease` event.
   */
  write(request?: Write): Promise<SubdomainUpdate | null> {
    return new Promise((resolve, reject) => {
      const doWrite = async (state: MeldState) => {
        if (request != null) {
          // Every write should produce one echo update or none.
          const beforeTick = this.tick;
          this.events.on('echo', resolve);
          try {
            this._state.state = await state.write(request);
            if (beforeTick === this.tick)
              resolve(null);
          } finally {
            // If clone tick not changed after write, cancel the expectation.
            if (beforeTick === this.tick)
              this.events.off('echo', resolve);
          }
        } else {
          resolve(null);
        }
      };
      if (this._state.lock === 'write')
        doWrite(this._state.state).catch(reject);
      else
        this._clone.write(state =>
          this.doAndStayLocked({ state, lock: 'write' },
            () => doWrite(state))).catch(reject);
    });
  }

  get locked() {
    return this._state.lock != null;
  }

  async unlock() {
    await this.queueStore.clear();
    this.events.emit('lockRelease');
  }

  close() {
    return this._clone.close();
  }
}