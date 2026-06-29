// NOTE: This script is NOT used by the docs site.
// The site uses `openapi.staticSource()` in lib/source.ts to generate virtual
// pages directly from content/api-reference/openapi.json — no MDX files needed.
//
// This script can be used to generate MDX files if you want to switch back to
// the MDX-based approach (e.g., to add custom content to individual endpoint pages).
// Run from docs-site/: node scripts/generate-api-docs.mjs

import { generateFiles } from 'fumadocs-openapi';
import { createOpenAPI } from 'fumadocs-openapi/server';

const openapi = createOpenAPI({
  input: ['content/api-reference/openapi.json'],
});

await generateFiles({
  input: openapi,
  output: 'content/api-reference',
  per: 'operation',
  groupBy: 'tag',
});

console.log('API docs generated.');
