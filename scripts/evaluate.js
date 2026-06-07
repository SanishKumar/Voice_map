import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseCommand } from '../src/parser/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runEvaluation() {
  console.log('🎙️  Starting VoiceGIS Evaluation Harness...\n');
  
  const benchmarksPath = path.join(__dirname, '../src/evaluation/benchmarks.json');
  let benchmarks;
  
  try {
    const data = await fs.readFile(benchmarksPath, 'utf-8');
    benchmarks = JSON.parse(data);
  } catch (err) {
    console.error('❌ Failed to load benchmarks.json:', err.message);
    process.exit(1);
  }

  let total = benchmarks.length;
  let passed = 0;
  let failed = [];

  const startTime = Date.now();

  for (const test of benchmarks) {
    const result = await parseCommand(test.text, { enableGeocoding: false });
    
    let isPass = result.intent === test.intent;
    
    // Also verify payload if specified in benchmark
    if (isPass && test.payload) {
      for (const [key, val] of Object.entries(test.payload)) {
        if (result.payload[key] !== val) {
          isPass = false;
          break;
        }
      }
    }

    if (isPass) {
      passed++;
      process.stdout.write('✅ ');
    } else {
      process.stdout.write('❌ ');
      failed.push({
        text: test.text,
        expectedIntent: test.intent,
        actualIntent: result.intent,
        expectedPayload: test.payload,
        actualPayload: result.payload,
      });
    }
  }

  const duration = Date.now() - startTime;
  
  console.log(`\n\n📊 Evaluation Complete in ${duration}ms`);
  console.log(`Accuracy: ${((passed / total) * 100).toFixed(1)}% (${passed}/${total} passed)`);
  
  if (failed.length > 0) {
    console.log('\n❌ Failed Cases:');
    failed.forEach(f => {
      console.log(`  - Text: "${f.text}"`);
      console.log(`    Expected Intent: ${f.expectedIntent} | Actual: ${f.actualIntent}`);
      if (f.expectedPayload || f.actualPayload) {
        console.log(`    Expected Payload: ${JSON.stringify(f.expectedPayload)} | Actual: ${JSON.stringify(f.actualPayload)}`);
      }
    });
    process.exit(1); // Exit with error code if any tests fail
  } else {
    console.log('\n🎉 All benchmarks passed!');
    process.exit(0);
  }
}

runEvaluation();
