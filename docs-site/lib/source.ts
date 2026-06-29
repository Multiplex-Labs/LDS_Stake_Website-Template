import { docs, meta } from '@/.source/server';
import { loader } from 'fumadocs-core/source';
import { toFumadocsSource } from 'fumadocs-mdx/runtime/server';
import { openapi } from './openapi';
import type * as PageTree from 'fumadocs-core/page-tree';
import type { OperationOutput, WebhookOutput, OperationItem } from 'fumadocs-openapi';

export const docsSource = loader({
  baseUrl: '/docs',
  source: toFumadocsSource(docs, meta),
});

// Virtual pages generated at build time from the OpenAPI spec.
// groupBy: 'tag' organises the sidebar by resource type.
// meta: true emits virtual meta.json files so fumadocs uses x-displayName as folder titles.
// name() produces clean URL slugs regardless of FastAPI's auto-generated operationIds.
export const apiSource = loader({
  baseUrl: '/docs/api-reference',
  source: await openapi.staticSource({
    groupBy: 'tag',
    meta: true,
    name(result: Omit<OperationOutput | WebhookOutput, 'path'>): string {
      if (result.type !== 'operation') {
        return (result.item as { name?: string; method: string }).name ?? result.item.method;
      }
      const { path, method } = result.item as OperationItem;
      const m = method.toLowerCase();

      // Convert each path segment: {param_id} → "param", literal → itself.
      // Then deduplicate consecutive identical segments (e.g. slot/{slot_id} → ["slot"]).
      const simplified = path
        .split('/')
        .filter(Boolean)
        .map((p) =>
          p.startsWith('{') ? p.replace(/[{}]/g, '').replace(/_id$/, '').replace(/_/g, '-') : p
        )
        .reduce<string[]>((acc, seg) => {
          if (acc[acc.length - 1] !== seg) acc.push(seg);
          return acc;
        }, []);

      const tail = simplified.slice(1); // drop the resource root (first segment)

      if (tail.length > 0) return `${tail.join('-')}-${m}`;

      // Root of resource (no tail): use HTTP verb semantics for a clean slug.
      const roots: Record<string, string> = {
        get: 'list',
        post: 'create',
        put: 'update',
        delete: 'delete',
        patch: 'patch',
      };
      return roots[m] ?? m;
    },
  }),
  plugins: [openapi.loaderPlugin()],
});

function extractPageUrls(nodes: PageTree.Node[]): string[] {
  const urls: string[] = [];
  for (const node of nodes) {
    if (node.type === 'page') urls.push(node.url);
    else if (node.type === 'folder') {
      if (node.index?.url) urls.push(node.index.url);
      urls.push(...extractPageUrls(node.children));
    }
  }
  return urls;
}

export const docsUrls = new Set<string>([
  '/docs',
  ...extractPageUrls(docsSource.pageTree.children),
]);

export const apiUrls = new Set<string>([
  '/docs/api-reference',
  '/docs/api-reference/overview',
  ...extractPageUrls(apiSource.pageTree.children),
]);
