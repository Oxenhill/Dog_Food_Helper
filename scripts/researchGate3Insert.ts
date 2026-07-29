import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { commitApprovedGate3Claims } from '../src/lib/researchGate3Database';

const MANIFEST_PATH = resolve('docs/research-gate3-proposed-claims-2026-07-29.json');
const APPROVAL_PATH = resolve('docs/research-gate3-approved-claims-2026-07-29.json');

async function main(): Promise<void> {
  const execute = process.argv.includes('--execute');
  const [manifestRaw, approvalRaw] = await Promise.all([
    readFile(MANIFEST_PATH, 'utf8'),
    readFile(APPROVAL_PATH, 'utf8'),
  ]);
  const report = await commitApprovedGate3Claims(manifestRaw, approvalRaw, !execute);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
