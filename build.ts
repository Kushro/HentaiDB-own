import * as esbuild from 'esbuild';
import JSZip from 'jszip';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = import.meta.dirname;
const DIST = path.join(ROOT, 'dist');
fs.mkdirSync(DIST, { recursive: true });

// Node worker bundle (CJS, node built-ins external). Data-only extension:
// no renderer bundle is produced.
await esbuild.build({
  entryPoints: [path.join(ROOT, 'src/index.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  outfile: path.join(DIST, 'bundle.js'),
  external: ['node:*', 'fs', 'path', 'os', 'crypto', 'url', 'util', 'http', 'https'],
});

// This package.json has "type":"module", but the bundle is CommonJS (the host
// require()s it). Mark the dist dir as CommonJS so node loads bundle.js as CJS.
fs.writeFileSync(path.join(DIST, 'package.json'), JSON.stringify({ type: 'commonjs' }) + '\n');

// Zip -> dist/hentaidb.kai (manifest.json + bundle.js + README.md + icon.png)
const zip = new JSZip();
const files: [string, string][] = [
  ['manifest.json', 'manifest.json'],
  ['bundle.js', 'dist/bundle.js'],
  ['README.md', 'README.md'],
  ['icon.png', 'icon.png'],
];
for (const [name, src] of files) {
  zip.file(name, fs.readFileSync(path.join(ROOT, src)));
}
fs.writeFileSync(
  path.join(DIST, 'hentaidb.kai'),
  await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }),
);

console.log('[hentaidb] built dist/bundle.js and dist/hentaidb.kai');
