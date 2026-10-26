import electron from 'electron';
import { spawnSync } from 'node:child_process';

// better-sqlite3 13 ships Node-API prebuilds, including darwin-arm64.
// Verify the real Electron runtime can load it instead of rebuilding from source.
const result = spawnSync(electron, ['--eval', `
  const Database = require('better-sqlite3');
  const database = new Database(':memory:');
  const version = database.prepare('SELECT sqlite_version() AS version').get().version;
  database.close();
  console.log('SQLite ' + version + ' ready for Electron ' + process.versions.electron + ' (' + process.arch + ')');
`], { stdio: 'inherit', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } });

if (result.error) throw result.error;
process.exit(result.status ?? 1);
