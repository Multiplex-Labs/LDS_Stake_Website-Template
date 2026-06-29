import { docsSource, apiSource } from '@/lib/source';
import { createSearchAPI } from 'fumadocs-core/search/server';

export const { GET } = createSearchAPI('simple', {
  indexes: [
    ...docsSource.getPages().map((page) => ({
      title: page.data.title ?? page.slugs.at(-1) ?? '',
      description: page.data.description ?? '',
      url: page.url,
      content: (page.data.structuredData?.contents ?? [])
        .map((c: { content: string }) => c.content)
        .join('\n'),
    })),
    ...apiSource.getPages().map((page) => ({
      title: (page.data as { title?: string }).title ?? page.slugs.at(-1) ?? '',
      description: (page.data as { description?: string }).description ?? '',
      url: page.url,
      content: (
        (
          page.data as {
            structuredData?: { contents?: { content: string }[] };
          }
        ).structuredData?.contents ?? []
      )
        .map((c: { content: string }) => c.content)
        .join('\n'),
    })),
  ],
});
