#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');

console.log('🧪 Running Component Tests...\n');

const testDirs = [
  'donors',
  'campaigns', 
  'projects'
];

let totalPassed = 0;
let totalFailed = 0;

testDirs.forEach(dir => {
  console.log(`\n📁 Testing ${dir} components...`);
  try {
    execSync(`npm run test:components:${dir}`, { 
      stdio: 'inherit',
      cwd: path.resolve(__dirname)
    });
    console.log(`✅ ${dir} tests passed`);
    totalPassed++;
  } catch (error) {
    console.log(`❌ ${dir} tests failed`);
    totalFailed++;
  }
});

console.log('\n📊 Test Summary:');
console.log(`✅ Passed: ${totalPassed}`);
console.log(`❌ Failed: ${totalFailed}`);
console.log(`📦 Total: ${testDirs.length}`);

process.exit(totalFailed > 0 ? 1 : 0);