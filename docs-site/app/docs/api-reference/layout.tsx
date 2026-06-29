import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import type { ReactNode } from 'react';
import { BookOpen, Code2 } from 'lucide-react';
import { apiSource, docsUrls, apiUrls } from '@/lib/source';
import { FullSearchTrigger } from 'fumadocs-ui/layouts/shared/slots/search-trigger';

const tabs = [
  {
    title: 'Documentation',
    description: 'Guides and references',
    url: '/docs/introduction',
    icon: <BookOpen className="size-4 text-blue-400" />,
    urls: docsUrls,
  },
  {
    title: 'API Reference',
    description: 'REST API endpoints',
    url: '/docs/api-reference/overview',
    icon: <Code2 className="size-4 text-orange-400" />,
    urls: apiUrls,
  },
];

export default function ApiReferenceLayout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout
      tree={apiSource.pageTree}
      tabs={tabs}
      nav={{ title: 'LDS Stake Portal' }}
      sidebar={{
        banner: <FullSearchTrigger key="sidebar-search" className="w-full" />,
        defaultOpenLevel: 1,
      }}
      searchToggle={{ enabled: false }}
    >
      {children}
    </DocsLayout>
  );
}
