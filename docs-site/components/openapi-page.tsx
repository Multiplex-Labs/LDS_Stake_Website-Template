'use client';
import { createOpenAPIPage } from 'fumadocs-openapi/ui';
import { createCodeUsageGeneratorRegistry } from 'fumadocs-openapi/requests/generators';
import { registerDefault } from 'fumadocs-openapi/requests/generators/all';

const registry = registerDefault(createCodeUsageGeneratorRegistry());

export const OpenAPIPage = createOpenAPIPage({ codeUsages: registry });
