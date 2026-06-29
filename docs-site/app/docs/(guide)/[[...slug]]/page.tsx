import { docsSource } from '@/lib/source';
import {
  DocsPage,
  DocsBody,
  DocsTitle,
  DocsDescription,
} from 'fumadocs-ui/page';
import { Cards, Card } from 'fumadocs-ui/components/card';
import { notFound } from 'next/navigation';
import { getMDXComponents } from '@/mdx-components';
import { BookOpen, Server, Code2, Users, Cpu, FileText } from 'lucide-react';

function LandingPage() {
  return (
    <DocsPage>
      <DocsTitle>LDS Stake Portal</DocsTitle>
      <DocsDescription>
        Everything you need to set up, use, and extend the Stake Portal.
      </DocsDescription>
      <DocsBody>
        <Cards>
          <Card
            title="Introduction"
            href="/docs/introduction"
            description="What the portal includes and who it is for."
            icon={<FileText className="size-5" />}
          />
          <Card
            title="Quickstart"
            href="/docs/quickstart"
            description="Get a local instance running in under 10 minutes."
            icon={<BookOpen className="size-5" />}
          />
          <Card
            title="User Guide"
            href="/docs/user-guide/overview"
            description="Use the portal as a stake leader — callings, assignments, speaking, and more."
            icon={<Users className="size-5" />}
          />
          <Card
            title="Deployment"
            href="/docs/deployment/overview"
            description="Deploy and maintain the portal on your own server."
            icon={<Server className="size-5" />}
          />
          <Card
            title="Development"
            href="/docs/development/architecture"
            description="Understand the architecture and contribute to the codebase."
            icon={<Cpu className="size-5" />}
          />
          <Card
            title="API Reference"
            href="/docs/api-reference/overview"
            description="REST API endpoints, authentication, and request examples."
            icon={<Code2 className="size-5" />}
          />
        </Cards>
      </DocsBody>
    </DocsPage>
  );
}

export default async function Page(props: {
  params: Promise<{ slug?: string[] }>;
}) {
  const params = await props.params;

  if (!params.slug || params.slug.length === 0) {
    return <LandingPage />;
  }

  const page = docsSource.getPage(params.slug);
  if (!page) notFound();

  const MDX = page.data.body;

  return (
    <DocsPage toc={page.data.toc}>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <DocsBody>
        <MDX components={getMDXComponents({})} />
      </DocsBody>
    </DocsPage>
  );
}

export async function generateStaticParams() {
  const params = docsSource.generateParams();
  return [{ slug: undefined }, ...params];
}

export async function generateMetadata(props: {
  params: Promise<{ slug?: string[] }>;
}) {
  const params = await props.params;

  if (!params.slug || params.slug.length === 0) {
    return {
      title: 'Documentation — LDS Stake Portal',
      description:
        'Everything you need to set up, use, and extend the LDS Stake Portal.',
    };
  }

  const page = docsSource.getPage(params.slug);
  if (!page) notFound();
  return {
    title: page.data.title,
    description: page.data.description,
  };
}
