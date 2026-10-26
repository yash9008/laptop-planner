import { build as bundle } from 'esbuild';
import { build as buildRenderer } from 'vite';
import { rm, mkdir, copyFile } from 'node:fs/promises';

await rm(new URL('../out', import.meta.url), { recursive: true, force: true });
await Promise.all([
  bundle({
    entryPoints: ['src/main/index.ts', 'src/preload/index.ts'],
    outbase: 'src',
    outdir: 'out',
    outExtension: { '.js': '.cjs' },
    bundle: true,
    platform: 'node',
    target: 'node24',
    format: 'cjs',
    external: ['electron', 'better-sqlite3'],
    sourcemap: true,
  }),
  buildRenderer(),
  (async()=>{await mkdir('out/main/assets',{recursive:true});await copyFile('src/main/assets/focusTemplate.png','out/main/assets/focusTemplate.png');})(),
]);
