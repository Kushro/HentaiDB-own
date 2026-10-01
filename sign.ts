/**
 * sign.ts — Ed25519 signer for the HentaiDB .kai bundle.
 *
 * The Tatakai loader (`desktop/runtime/extension/kai-format.cjs`,
 * `desktop/ipc/ipc-runtime.cjs`) treats `manifest.signature` as a base64
 * Ed25519 signature over the raw bytes of `bundle.js`, verified with
 * `crypto.verify(null, bundleBytes, { key: <PEM>, format:'pem', type:'spki' }, sig)`
 * against the public key in the `TATAKAI_EXT_PUBLIC_KEY` env var.
 *
 * IMPORTANT: a stock Tatakai build ships a PLACEHOLDER (all-zero) public key,
 * so a signed `.kai` only verifies in a build launched with
 * `TATAKAI_EXT_PUBLIC_KEY` set to the public key printed below. For the public
 * app, install the signature-free `dist/hentaidb.kai` (sideload) instead.
 *
 * Key resolution order:
 *   1. $TATAKAI_EXT_PRIVATE_KEY  — PKCS#8 PEM string, or a path to one
 *   2. keys/private.pem          — reused across releases if present
 *   3. freshly generated Ed25519 keypair, written to keys/ (gitignored)
 *
 * Run `npm run build` first (this reads dist/bundle.js), or use `npm run sign`
 * which chains both. Emits dist/hentaidb-signed.kai + dist/public-key.pem.
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import JSZip from 'jszip';

const ROOT = import.meta.dirname;
const DIST = path.join(ROOT, 'dist');
const KEYS = path.join(ROOT, 'keys');

const bundlePath = path.join(DIST, 'bundle.js');
if (!fs.existsSync(bundlePath)) {
  console.error('[sign] dist/bundle.js not found — run `npm run build` first.');
  process.exit(1);
}

function loadPrivateKey(): crypto.KeyObject {
  const env = process.env.TATAKAI_EXT_PRIVATE_KEY;
  if (env) {
    const pem = fs.existsSync(env) ? fs.readFileSync(env, 'utf8') : env;
    return crypto.createPrivateKey(pem);
  }
  const stored = path.join(KEYS, 'private.pem');
  if (fs.existsSync(stored)) {
    return crypto.createPrivateKey(fs.readFileSync(stored, 'utf8'));
  }
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
  fs.mkdirSync(KEYS, { recursive: true });
  fs.writeFileSync(path.join(KEYS, 'private.pem'), privateKey.export({ type: 'pkcs8', format: 'pem' }) as string);
  fs.writeFileSync(path.join(KEYS, 'public.pem'), publicKey.export({ type: 'spki', format: 'pem' }) as string);
  console.log('[sign] generated a new Ed25519 keypair in keys/ (private.pem is gitignored — keep it safe).');
  return privateKey;
}

const privateKey = loadPrivateKey();
const publicPem = crypto.createPublicKey(privateKey).export({ type: 'spki', format: 'pem' }) as string;

const bundleBytes = fs.readFileSync(bundlePath);
const signature = crypto.sign(null, bundleBytes, privateKey).toString('base64');

// Signed manifest: drop `sideloaded` (presence of a signature forces the
// curated/verified trust path) and embed the signature.
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
delete manifest.sideloaded;
manifest.signature = signature;

const zip = new JSZip();
zip.file('manifest.json', JSON.stringify(manifest, null, 2));
zip.file('bundle.js', bundleBytes);
zip.file('README.md', fs.readFileSync(path.join(ROOT, 'README.md')));
zip.file('icon.png', fs.readFileSync(path.join(ROOT, 'icon.png')));
fs.writeFileSync(
  path.join(DIST, 'hentaidb-signed.kai'),
  await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }),
);
fs.writeFileSync(path.join(DIST, 'public-key.pem'), publicPem);

console.log('[hentaidb] signed dist/hentaidb-signed.kai');
console.log('[hentaidb] signature (base64):', signature);
console.log('\nTo trust this build, launch Tatakai with:\n');
console.log('TATAKAI_EXT_PUBLIC_KEY=' + JSON.stringify(publicPem.trim()));
