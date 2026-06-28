import { createOpenAPI } from 'fumadocs-openapi/server';
import { APIPageClient } from './api-page-client';

const openapi = createOpenAPI({
  input: ['content/docs/api-reference/openapi.json'],
});

type Props = {
  document: string;
  operations?: Array<{ path: string; method: string }>;
  webhooks?: Array<{ name: string; method: string }>;
  hasHead?: boolean;
};

export async function APIPage({ document, operations, webhooks, hasHead }: Props) {
  const schema = await openapi.getSchema(document);
  return (
    <APIPageClient
      payload={{ bundled: schema.bundled }}
      operations={operations}
      webhooks={webhooks ?? []}
      showTitle={hasHead === true}
    />
  );
}
