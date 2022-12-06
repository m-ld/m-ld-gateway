import { Readable, ReadableOptions } from 'stream';
import type { GraphSubject, ReadResult } from '@m-ld/m-ld';
import { Subscription } from 'rxjs';

export interface ResultsFormat {
  opening?: string;
  closing?: string;
  separator: string;
  stringify(s: GraphSubject): string;
}

export type Results = ReadResult['consume'];

export class ResultsReadable extends Readable {
  private index = -1;
  private subs: Subscription;
  private next?: () => true;

  constructor(results: Results, format: ResultsFormat, opts?: ReadableOptions) {
    super(opts);
    const openIfRequired = () => {
      if (this.index === -1) {
        if (format.opening != null)
          this.push(Buffer.from(format.opening));
        this.index = 0;
      }
    };
    this.subs = results.subscribe({
      next: async bite => {
        openIfRequired();
        const subjectStr = format.stringify(bite.value);
        this.push(Buffer.from(`${this.index++ ? format.separator : ''}${subjectStr}`));
        this.next = bite.next;
      },
      complete: () => {
        openIfRequired();
        if (format.closing != null)
          this.push(Buffer.from(format.closing));
        this.push(null);
      },
      error: err => {
        this.destroy(err);
      }
    });
  }

  _read(size: number) {
    if (this.next) {
      this.next();
      delete this.next;
    }
  }

  _destroy(error: Error | null, callback: (error?: Error | null) => void) {
    this.subs.unsubscribe();
    callback(error);
  }
}