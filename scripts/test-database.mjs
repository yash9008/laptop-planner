import { build } from 'esbuild';
import electron from 'electron';
import { spawnSync } from 'node:child_process';

await build({
  entryPoints: ['tests/database.test.ts'],
  outfile: '.test-build/database.test.cjs',
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'cjs',
  external: ['better-sqlite3'],
  sourcemap: true,
});

// Run native SQLite tests with Electron's ABI, not the system Node ABI.
const result = spawnSync(electron, ['--test', '.test-build/database.test.cjs'], {
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
