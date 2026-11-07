// Runs scripts/site_stats.py with whichever Python launcher exists, so
// `npm run dev/build` works on macOS (python3), Linux CI (python) and
// Windows (py/python) without per-OS npm scripts.
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const script = resolve(here, '../../scripts/site_stats.py');
const out = resolve(here, '../src/data/catalog.json');
const extraArgs = process.argv.slice(2);

for (const launcher of ['python3', 'python', 'py']) {
  const result = spawnSync(launcher, [script, '--out', out, ...extraArgs], {
    stdio: 'inherit',
  });
  if (result.error && result.error.code === 'ENOENT') continue;
  process.exit(result.status ?? 1);
}

console.error(
  'run-stats: no Python launcher found (tried python3, python, py)',
);
process.exit(1);
