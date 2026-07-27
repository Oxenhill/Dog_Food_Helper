import { processGtinVerificationQueue } from '../src/lib/gs1Verify';

async function main() {
  const result = await processGtinVerificationQueue();
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
