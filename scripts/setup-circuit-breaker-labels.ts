#!/usr/bin/env tsx

import { Octokit } from '@octokit/rest';
import { createCircuitBreakerLabels } from '../shared/patterns/github-circuit-breaker.js';

const EXTENSION_REPOS = [
  { owner: 'littlebearapps', repo: 'notebridge' },
  { owner: 'littlebearapps', repo: 'convert-my-file' },
  { owner: 'littlebearapps', repo: 'palette-kit' }
];

async function main() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.error('❌ GITHUB_TOKEN environment variable not set');
    process.exit(1);
  }

  const octokit = new Octokit({ auth: token });

  console.log('🏷️  Setting up circuit breaker labels on extension repositories...\n');

  for (const { owner, repo } of EXTENSION_REPOS) {
    console.log(`📦 ${owner}/${repo}`);
    try {
      await createCircuitBreakerLabels(octokit, owner, repo);
      console.log(`✅ Labels created successfully\n`);
    } catch (error) {
      console.error(`❌ Failed to create labels:`, error);
      console.log('');
    }
  }

  console.log('🎉 Circuit breaker labels setup complete!');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
