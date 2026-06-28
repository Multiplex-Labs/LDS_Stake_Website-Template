'use client';
import dynamic from 'next/dynamic';

const BaseAPIPage = dynamic(
  () => import('fumadocs-openapi/ui').then(m => ({ default: m.createOpenAPIPage({}) })),
  { ssr: false }
);

export function APIPageClient(props: Record<string, unknown>) {
  return <BaseAPIPage {...(props as any)} />;
}
