#!/usr/bin/env tsx
import { translateText } from './translate-api.js';

async function test() {
  console.log('Testing translation API...\n');
  
  const testCases = [
    { text: 'Hello world', from: 'en', to: 'es' },
    { text: 'Practice doctor scenarios at A1 level.', from: 'en', to: 'fr' },
  ];
  
  for (const test of testCases) {
    console.log(`Translating: "${test.text}" (${test.from} → ${test.to})`);
    const result = await translateText(test.text, test.from, test.to);
    
    if (result.success) {
      console.log(`✅ Success: "${result.text}"\n`);
    } else {
      console.log(`❌ Failed: ${result.error}\n`);
    }
    
    // Small delay to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

test().catch(console.error);

