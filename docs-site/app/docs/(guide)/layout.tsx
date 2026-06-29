import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import type { ReactNode } from 'react';
import { BookOpen, Code2 } from 'lucide-react';
import { docsSource, docsUrls, apiUrls } from '@/lib/source';
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

export default function GuideLayout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout
      tree={docsSource.pageTree}
      tabs={tabs}
      nav={{ title: 'LDS Stake Portal' }}
      sidebar={{
        banner: <FullSearchTrigger key="sidebar-search" className="w-full" />,
      }}
      searchToggle={{ enabled: false }}
    >
      {children}
    </DocsLayout>
  );
}
