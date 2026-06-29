import { apiSource } from '@/lib/source';
import { OpenAPIPage } from '@/components/openapi-page';
import { Card, Cards } from 'fumadocs-ui/components/card';
import { DocsPage, DocsBody, DocsTitle, DocsDescription } from 'fumadocs-ui/page';
import {
  BookOpen,
  CalendarDays,
  Heart,
  KeyRound,
  ListChecks,
  MapPin,
  Phone,
  Users,
} from 'lucide-react';
import { notFound, redirect } from 'next/navigation';

function ApiOverviewPage() {
  return (
    <DocsPage>
      <DocsTitle>API Reference</DocsTitle>
      <DocsDescription>
        REST API for the LDS Stake Portal. All endpoints are prefixed with{' '}
        <code>/api</code> when accessed through the frontend proxy.
      </DocsDescription>
      <DocsBody>
        <Cards>
          <Card
            title="Authentication"
            href="/docs/api-reference/auth"
            description="Login, token refresh, current user profile, and logout."
            icon={<KeyRound className="size-5" />}
          />
          <Card
            title="User Management"
            href="/docs/api-reference/user-management"
            description="User CRUD, photo upload, and password management."
            icon={<Users className="size-5" />}
          />
          <Card
            title="Callings"
            href="/docs/api-reference/callings"
            description="Calling definitions, slots, and holder assignments."
            icon={<Phone className="size-5" />}
          />
          <Card
            title="Calling Tracker"
            href="/docs/api-reference/calling-kanban"
            description="Proposals, board state, comments, approvals, and stage transitions."
            icon={<ListChecks className="size-5" />}
          />
          <Card
            title="HC Assignments"
            href="/docs/api-reference/assignments"
            description="High Council speaking assignment CRUD and slot management."
            icon={<BookOpen className="size-5" />}
          />
          <Card
            title="Speaking Schedule"
            href="/docs/api-reference/speaking"
            description="Speaking calendar, yearly topics, and calendar overrides."
            icon={<CalendarDays className="size-5" />}
          />
          <Card
            title="Wards"
            href="/docs/api-reference/ward"
            description="Ward list and individual ward detail lookup."
            icon={<MapPin className="size-5" />}
          />
          <Card
            title="Health"
            href="/docs/api-reference/health"
            description="Service liveness check."
            icon={<Heart className="size-5" />}
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
  const slug = params.slug ?? [];

  if (slug.length === 0) redirect('/docs/api-reference/overview');

  if (slug.length === 1 && slug[0] === 'overview') {
    return <ApiOverviewPage />;
  }

  const page = apiSource.getPage(slug);
  if (!page) notFound();

  const openAPIProps = page.data.getOpenAPIPageProps();

  return (
    <DocsPage full toc={page.data.toc}>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsBody>
        <OpenAPIPage {...openAPIProps} />
      </DocsBody>
    </DocsPage>
  );
}

export async function generateStaticParams() {
  return [{ slug: ['overview'] }, ...apiSource.generateParams()];
}

export async function generateMetadata(props: {
  params: Promise<{ slug?: string[] }>;
}) {
  const params = await props.params;
  const slug = params.slug ?? [];

  if (slug.length === 0 || slug[0] === 'overview') {
    return { title: 'API Reference' };
  }

  const page = apiSource.getPage(slug);
  if (!page) notFound();
  return { title: page.data.title };
}
