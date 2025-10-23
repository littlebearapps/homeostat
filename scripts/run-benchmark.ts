import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { runBenchmark } from '../benches/runner';

async function main() {
  const result = await runBenchmark();
  const outputPath = 'benches/results/latest.json';

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(result, null, 2));

  process.exit(result.meetsTarget ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
