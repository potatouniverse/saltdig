/**
 * Test/Example usage of bounty-graph library
 * 
 * Run with: npx tsx src/lib/bounty-graph.test.ts
 */

import {
  extractBountySubgraph,
  createBountySpec,
  validateBountySpec,
  serializeBountySpec,
  parseBountySpec,
  type GIDGraph,
  type BountyMeta,
} from './bounty-graph';

// Example full GID graph
const fullGraph: GIDGraph = {
  version: "2",
  project: "example-api",
  nodes: {
    'auth-middleware': {
      type: 'code',
      status: 'open',
      priority: 'high',
      description: 'Express middleware for JWT authentication',
      files: ['src/middleware/auth.ts', 'src/types/auth.ts'],
      info_boundary: {
        files: {
          read: ['src/types/**', 'src/config/auth.ts', 'package.json'],
          write: ['src/middleware/auth.ts', 'src/middleware/auth.test.ts'],
        },
        env_vars: ['JWT_SECRET', 'TOKEN_EXPIRY'],
      },
      harness: {
        method: 'automated',
        checks: [
          {
            name: 'unit_tests',
            type: 'test_suite',
            command: 'npm test -- --filter auth',
            pass_criteria: { min_pass_rate: 1.0 },
          },
        ],
        timeout_per_check: 300,
      },
      bounty: {
        budget: 150.00,
        currency: 'USDC',
        deadline: '2025-08-01T00:00:00Z',
        type: 'standard',
      },
    },
    'jwt-validation': {
      type: 'code',
      status: 'open',
      priority: 'high',
      description: 'JWT token validation utilities',
      files: ['src/utils/jwt.ts'],
      info_boundary: {
        files: {
          read: ['src/types/**', 'package.json'],
          write: ['src/utils/jwt.ts', 'src/utils/jwt.test.ts'],
        },
      },
      harness: {
        method: 'automated',
        checks: [
          {
            name: 'unit_tests',
            type: 'test_suite',
            command: 'npm test -- --filter jwt',
            pass_criteria: { min_pass_rate: 1.0 },
          },
        ],
      },
      bounty: {
        budget: 75.00,
        currency: 'USDC',
        deadline: '2025-07-25T00:00:00Z',
        type: 'standard',
      },
    },
    'token-refresh': {
      type: 'code',
      status: 'done',
      priority: 'medium',
      description: 'Token refresh endpoint (already completed)',
      files: ['src/routes/refresh.ts'],
      info_boundary: {
        files: {
          read: ['src/types/**'],
          write: ['src/routes/refresh.ts'],
        },
      },
      harness: {
        method: 'automated',
        checks: [{ name: 'tests', type: 'test_suite', command: 'npm test' }],
      },
    },
    'user-routes': {
      type: 'code',
      status: 'open',
      priority: 'low',
      description: 'User management routes (separate bounty)',
      files: ['src/routes/users.ts'],
      info_boundary: {
        files: {
          read: ['src/types/**'],
          write: ['src/routes/users.ts'],
        },
      },
      harness: {
        method: 'automated',
        checks: [{ name: 'tests', type: 'test_suite', command: 'npm test' }],
      },
    },
  },
  edges: [
    { from: 'token-refresh', to: 'jwt-validation', type: 'depends_on' },
    { from: 'jwt-validation', to: 'auth-middleware', type: 'depends_on' },
    { from: 'user-routes', to: 'auth-middleware', type: 'depends_on' },
  ],
};

async function testBountyExtraction() {
  console.log('=== Testing Bounty Graph Extraction ===\n');

  // 1. Extract a subgraph for auth-related nodes
  console.log('1. Extracting subgraph for [auth-middleware, jwt-validation]...');
  const subgraph = extractBountySubgraph(fullGraph, ['auth-middleware', 'jwt-validation']);
  
  console.log(`   ✓ Extracted ${Object.keys(subgraph.nodes).length} nodes`);
  console.log(`   ✓ Extracted ${subgraph.edges.length} edges`);
  console.log(`   Nodes: ${Object.keys(subgraph.nodes).join(', ')}\n`);

  // 2. Create bounty spec
  console.log('2. Creating bounty spec...');
  const bountyMeta: BountyMeta = {
    budget: 225.00, // sum of auth-middleware + jwt-validation
    currency: 'USDC',
    deadline: '2025-08-01T00:00:00Z',
    type: 'standard',
    poster: 'agent:test-123',
    min_reputation: 50,
    tags: ['typescript', 'security', 'authentication'],
  };

  const bountySpec = createBountySpec(subgraph, bountyMeta);
  console.log(`   ✓ Created bounty spec for ${bountySpec.project}`);
  console.log(`   Budget: ${bountyMeta.budget} ${bountyMeta.currency}`);
  console.log(`   Deadline: ${bountyMeta.deadline}\n`);

  // 3. Validate the spec
  console.log('3. Validating bounty spec...');
  const validation = validateBountySpec(bountySpec);
  
  if (validation.valid) {
    console.log('   ✓ Validation passed!\n');
  } else {
    console.log('   ✗ Validation failed:');
    validation.errors.forEach(err => console.log(`     - ${err}`));
    console.log();
  }

  // 4. Serialize to YAML
  console.log('4. Serializing to YAML...');
  const yaml = serializeBountySpec(bountySpec);
  console.log('   ✓ Serialized to YAML:');
  console.log('   ---');
  console.log(yaml.split('\n').slice(0, 20).map(l => `   ${l}`).join('\n'));
  console.log('   ... (truncated)\n');

  // 5. Parse back from YAML
  console.log('5. Parsing from YAML...');
  const parsed = parseBountySpec(yaml);
  console.log(`   ✓ Parsed ${Object.keys(parsed.nodes).length} nodes`);
  console.log(`   ✓ Parsed ${parsed.edges.length} edges\n`);

  // 6. Test invalid spec (missing harness)
  console.log('6. Testing validation with invalid spec...');
  const invalidSpec = { ...bountySpec };
  // @ts-ignore
  delete invalidSpec.nodes['auth-middleware'].harness;
  const invalidValidation = validateBountySpec(invalidSpec);
  
  if (!invalidValidation.valid) {
    console.log('   ✓ Correctly detected invalid spec:');
    invalidValidation.errors.forEach(err => console.log(`     - ${err}`));
  }

  console.log('\n=== All tests completed ===');
}

// Run tests if this file is executed directly
if (require.main === module) {
  testBountyExtraction().catch(console.error);
}
