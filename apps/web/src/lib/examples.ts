import 'server-only';
import fs from 'node:fs';
import path from 'node:path';

/**
 * The documentation shows the exact files in /examples, which are executed against the real API by
 * apps/api/tests/integration/sn-examples.test.ts. That is how the docs stay correct.
 */
const ROOT = path.resolve(process.cwd(), '../../examples');

export function readExample(relativePath: string): string {
  try {
    return fs.readFileSync(path.join(ROOT, relativePath), 'utf8').trimEnd();
  } catch {
    return `// example file ${relativePath} is not available in this deployment`;
  }
}
