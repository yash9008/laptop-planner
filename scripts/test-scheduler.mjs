import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';

// A browser build proves the engine has no Electron, Node, SQLite, or UI imports.
const browser = await build({
  entryPoints: ['src/scheduler/index.ts'], bundle: true, platform: 'browser',
  format: 'esm', write: false, metafile: true,
});
const dependencies = Object.keys(browser.metafile.inputs);
if (dependencies.some((path) => !path.startsWith('src/scheduler/'))) {
  throw new Error(`Scheduler must be standalone TypeScript; found external source: ${dependencies.join(', ')}`);
}
console.log('Standalone browser build passed: no runtime dependencies.');

await build({
  entryPoints: ['tests/scheduler.test.ts'], outfile: '.test-build/scheduler.test.cjs',
  bundle: true, platform: 'node', format: 'cjs', target: 'node24', sourcemap: true,
});
// Identical tests in two timezones protect the explicit local-date contract.
for (const timeZone of ['Asia/Kolkata', 'America/Los_Angeles']) {
  console.log(`\nScheduler tests with system TZ=${timeZone}`);
  const result = spawnSync(process.execPath, ['--test', '.test-build/scheduler.test.cjs'], {
    stdio: 'inherit', env: { ...process.env, TZ: timeZone },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
