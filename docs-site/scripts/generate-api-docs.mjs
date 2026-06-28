import { generateFiles } from 'fumadocs-openapi';
import { createOpenAPI } from 'fumadocs-openapi/server';

const openapi = createOpenAPI({
  input: ['content/docs/api-reference/openapi.json'],
});

await generateFiles({
  input: openapi,
  output: 'content/docs/api-reference',
  per: 'operation',
  groupBy: 'route',
});

console.log('API docs generated.');
