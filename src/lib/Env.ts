import { join, sep } from 'path';
import { mkdir, readdir, readFile, rm, rmdir, writeFile } from 'fs/promises';
import env_paths, { Paths } from 'env-paths';
import createYargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import * as dotenv from 'dotenv';

// [Development] Pull variables from .env file into process.env
dotenv.config();

/** General configuration */
export interface Config {[key: Exclude<string, '_' | '$0'>]: unknown;}

/** paths for local data, config, logs etc. */
type EnvPaths = Paths & {
  /**
   * provides the prefix into yargs.env, if `false`, no environment variables
   * will be read
   */
  env: string | false
};

export class Env {
  public readonly envPaths: EnvPaths;

  /**
   * The `appName` parameter drives the default paths determination, according
   * to the `env-paths` module; and also the default prefix for environment
   * variables.
   *
   * @see https://github.com/sindresorhus/env-paths#api
   * @see https://yargs.js.org/docs/#api-reference-envprefix
   */
  constructor(appName: string, envPaths: Partial<EnvPaths> = {}) {
    this.envPaths = Env.mergeConfig<EnvPaths>(
      { env: Env.toEnvVar(appName) }, env_paths(appName), envPaths);
  }

  /** @returns name uppercase snake-case */
  static toEnvVar(name: string) {
    return name
      // Non-word characters (including hyphens) with underscores
      .replace(/\W+/g, '_')
      // Camel case to snake case
      .replace(/([A-Z])/g, '_$&')
      .toUpperCase();
  }

  get envPrefix() {
    return this.envPaths.env ? `${this.envPaths.env}_` : '';
  }

  /**
   * @returns the config as an object containing environment variables, e.g. {
   *   TIMELD_GATEWAY_KEY1: 'key1',
   *   TIMELD_GATEWAY_NESTED__KEY2: 'key2',
   * }
   * @param config
   * @param filter if non-empty, the keys to include
   * @param env existing env to add to
   * @param prefix prefix for new entries
   */
  asEnv(
    config: Config,
    filter: string[] = [],
    env: { [env: string]: string } = {},
    prefix = this.envPrefix
  ) {
    for (let [key, value] of Object.entries(config)) {
      if (value != null && value !== '' && (filter.length === 0 || filter.includes(key))) {
        const envVar = `${prefix}${Env.toEnvVar(key)}`;
        if (typeof value == 'object')
          this.asEnv(<Config>value, [], env, `${envVar}__`);
        else
          env[envVar] = `${value}`;
      }
    }
    return env;
  }

  baseYargs(args = hideBin(process.argv)) {
    // noinspection SpellCheckingInspection
    return createYargs(args)
      .updateStrings({ 'Positionals:': 'Details:' })
      .parserConfiguration({ 'strip-dashed': true, 'strip-aliased': true });
  }

  async yargs(args = hideBin(process.argv)) {
    const argv = this.baseYargs(args);
    return (this.envPaths.env ? argv.env(this.envPaths.env) : argv.env(false))
      .config(await this.readConfig())
      .option('logLevel', { default: process.env.LOG_LEVEL, type: 'string' });
  }

  /**
   * Gets the path of a file or directory under an environment key.
   * Ensures that the parent directory exists.
   */
  async readyPath(key: keyof Paths, ...path: string[]) {
    if (path.length === 0)
      throw new RangeError('Path must contain an entry');
    const parentDir = join(this.envPaths[key], ...path.slice(0, -1));
    await mkdir(parentDir, { recursive: true });
    return join(parentDir, ...path.slice(-1));
  }

  async readConfig(): Promise<Config> {
    // Not creating anything here
    const configFile = join(this.envPaths['config'], 'config.json');
    try {
      return JSON.parse(await readFile(configFile, 'utf8'));
    } catch (err) {
      return this.defaultIfNotExists(err, {});
    }
  }

  /** @returns config parameter, for chaining */
  async writeConfig(config: Config): Promise<Config> {
    const path = await this.readyPath('config', 'config.json');
    await writeFile(path, JSON.stringify(config, null, ' '));
    return config;
  }

  /** @returns final config written */
  async updateConfig(...configs: Config[]): Promise<Config> {
    const current = await this.readConfig();
    if (!configs.length)
      return current;
    return this.writeConfig(Env.mergeConfig(current, configs[0], ...configs.slice(1)));
  }

  static isConfigKey(k: keyof Config) {
    return k !== '_' && k !== '$0';
  }

  /**
   * @param {*} current
   * @param {*} override
   * @param {*} more
   * @returns {*}
   */
  static mergeConfig<T = Config>(
    current: any,
    override: any,
    ...more: any[]
  ): T {
    const merged = (function () {
      if (override === false) {
        return undefined;
      } else if (override == null) {
        return current;
      } else if (Array.isArray(current) && Array.isArray(override)) {
        return [...current, ...override];
      } else if (typeof current == 'object' && typeof override == 'object') {
        const merged: Config = {};
        for (let key of [...Object.keys(current), ...Object.keys(override)]) {
          if (!(key in merged) && Env.isConfigKey(key))
            merged[key] = Env.mergeConfig(current[key], override[key]);
        }
        return merged;
      } else {
        return override;
      }
    })();
    return more.length > 0 ?
      Env.mergeConfig(merged, more[0], ...more.slice(1)) : merged;
  }

  /**
   * List the sub-paths, having no child directories, under the given key.
   * @returns leaf sub-paths
   */
  async envDirs(key: keyof Paths): Promise<string[][]> {
    async function *subDirs(dir: string): AsyncGenerator<string> {
      for (let dirEnt of await readdir(dir, { withFileTypes: true })) {
        if (dirEnt.isDirectory()) {
          const dirPath = join(dir, dirEnt.name);
          let anySubDirs = false;
          for await (let subDir of subDirs(dirPath)) {
            yield subDir;
            anySubDirs = true;
          }
          if (!anySubDirs)
            yield dirPath;
        }
      }
    }
    try {
      const envPath = this.envPaths[key];
      const envDirs = [];
      for await (let dir of subDirs(envPath))
        envDirs.push(dir.slice(envPath.length + 1).split(sep));
      return envDirs;
    } catch (err) {
      return this.defaultIfNotExists(err, []);
    }
  }

  /** Deletes the given env directory */
  async delEnvDir(key: keyof Paths, path: string[], { force }: { force?: boolean } = {}) {
    const dir = join(this.envPaths[key], ...path);
    if (path.length > 0 && (force || (await readdir(dir)).length === 0)) {
      if (force)
        await rm(dir, { recursive: true, force: true });
      else
        await rmdir(dir);
      // Tidy empty parent dirs
      await this.delEnvDir(key, path.slice(0, -1));
    }
  }

  // noinspection JSUnusedGlobalSymbols
  async delEnvFile(key: keyof Paths, path: string[]) {
    // Delete the given path, and then any empty parent folders
    await rm(join(this.envPaths[key], ...path));
    await this.delEnvDir(key, path.slice(0, -1));
  }

  defaultIfNotExists<T>(err: any, defaultValue: T) {
    if (err.code === 'ENOENT') {
      return defaultValue;
    } else {
      throw err;
    }
  }
}
