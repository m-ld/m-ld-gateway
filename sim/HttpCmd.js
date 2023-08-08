import { Cmd } from '@m-ld/m-ld-test';
import path from 'path';
import { fileURLToPath } from 'url';

const specPath = fileURLToPath(new URL('../doc/_includes/http', import.meta.url));
export const spec = id => path.join(specPath, ...id.split('/')) + '.http';

// Not using npx to run hurl because it tries to debug
const hurlPath = fileURLToPath(new URL(
  '../node_modules/@orangeopensource/hurl/bin/hurl', import.meta.url));

export default class HttpCmd extends Cmd {
  constructor(origin) {
    super();
    this.origin = origin;
  }

  request = async (httpFilePath, variables) => {
    await this.spawn(
      hurlPath, httpFilePath,
      '--variable', `origin=${this.origin}`,
      ...(Object.entries(variables)
        .map(([varName, value]) =>
          ['--variable', `${varName}=${value}`])
        .flat())
    );
    // Assume a result is either a single line of JSON, or nd-json
    const out = await this.waitForExit();
    try {
      const lines = out.split('\n');
      return lines.length === 0 ? undefined :
        lines.length === 1 ? JSON.parse(lines[0]) :
          lines.map(line => JSON.parse(line));
    } catch (e) {
      console.error(out);
      throw e;
    }
  };
}