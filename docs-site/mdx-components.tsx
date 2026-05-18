import type { MDXComponents } from 'mdx/types';
import defaultMdxComponents from 'fumadocs-ui/mdx';
import { APIPage } from 'fumadocs-openapi/ui';
import { Steps, Step } from 'fumadocs-ui/components/steps';
import { Tabs, Tab } from 'fumadocs-ui/components/tabs';

export function getMDXComponents(components: MDXComponents): MDXComponents {
  return {
    ...defaultMdxComponents,
    APIPage,
    Steps,
    Step,
    Tabs,
    Tab,
    ...components,
  };
}
