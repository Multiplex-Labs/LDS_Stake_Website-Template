import { generateFiles } from 'fumadocs-openapi';

await generateFiles({
  input: ['content/docs/api-reference/openapi.json'],
  output: 'content/docs/api-reference',
  per: 'operation',
  groupBy: 'tag',
});

console.log('API docs generated.');
