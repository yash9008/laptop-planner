import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const logFile = process.argv[2];
if (!logFile) {
  console.error('Usage: node scripts/extract-phase5-evidence.mjs <raw-log-file>');
  process.exit(1);
}

const content = readFileSync(logFile, 'utf8');
const outDir = join(process.cwd(), 'docs/evidence/phase5-motion-acceptance');
const screenshotsDir = join(outDir, 'screenshots');
mkdirSync(screenshotsDir, { recursive: true });

// Matches both with or without timestamp prefix
const regex = /(?:^[^\n]*?=== SCREENSHOT:\s*([^\s]+)\s*===[^\n]*\r?\n)([\s\S]*?)(?:^[^\n]*?=== END SCREENSHOT ===[^\n]*\r?\n)/gm;
let match;
const hashes = {};
let count = 0;

function parsePngDimensions(buf) {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < 8; i++) {
    if (buf[i] !== sig[i]) throw new Error(`Not a valid PNG file: signature mismatch at byte ${i}`);
  }
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  return { width, height };
}

while ((match = regex.exec(content)) !== null) {
  const filename = match[1].trim();
  // Filter only ui-phase5 screenshots
  if (!filename.startsWith('ui-phase5-')) continue;

  const rawBase64 = match[2]
    .split(/\r?\n/)
    .map(line => line.replace(/^\d{4}-\d{2}-\d{2}T[^\s]+\s+/, '').trim())
    .filter(Boolean)
    .join('');

  const buf = Buffer.from(rawBase64, 'base64');
  const dim = parsePngDimensions(buf);
  console.log(`Extracted ${filename}: ${buf.length} bytes, dimensions: ${dim.width}x${dim.height}`);

  const filePath = join(screenshotsDir, filename);
  writeFileSync(filePath, buf);

  const hash = createHash('sha256').update(buf).digest('hex');
  hashes[filename] = hash;
  count++;
}

if (count === 0) {
  console.error('No ui-phase5 screenshots found in log file.');
  process.exit(1);
}

const hashFile = join(outDir, 'screenshot-sha256.json');
writeFileSync(hashFile, JSON.stringify(hashes, null, 2) + '\n');
console.log(`Saved ${count} screenshots and sha256 checksums to ${hashFile}`);
