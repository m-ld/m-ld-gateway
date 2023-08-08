import { Cmd } from '@m-ld/m-ld-test';
import path from 'path';
import { createWriteStream } from 'fs';
import { fileURLToPath } from 'url';

const startPath = fileURLToPath(new URL('../ext/start.js', import.meta.url));

export default class GwCmd extends Cmd {
  /**
   * @param {string} name
   * @param {import('loglevel').LogLevelNames} logLevel
   * @param {false | 'doctor' | 'bubbleprof'} clinic
   */
  constructor({
    name = 'gw',
    logLevel = undefined,
    clinic = false
  } = {}) {
    super(name);
    this.logLevel = logLevel;
    this.clinic = clinic;
  }

  async start() {
    this.console = console;
    this.dataDir = this.createDir('data');
    if (this.logLevel) {
      const stdout = createWriteStream(path.join(this.dataDir, 'gw.log'));
      this.childConsole = new console.Console({ stdout, stderr: process.stderr });
    }
    const env = {
      ...process.env,
      M_LD_GATEWAY_DATA_PATH: this.dataDir,
      LOG_LEVEL: this.logLevel
    };
    const gwArgs = [startPath, '--genesis', 'true', { env }];
    if (this.clinic) {
      await this.spawn('clinic', this.clinic, '--', 'node', ...gwArgs);
    } else {
      await this.fork(...gwArgs);
    }
    await this.findByText('Gateway initialised');
  }
}