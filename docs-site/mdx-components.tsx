import type { MDXComponents } from 'mdx/types';
import defaultMdxComponents from 'fumadocs-ui/mdx';
import { Steps, Step } from 'fumadocs-ui/components/steps';
import { Tabs, Tab } from 'fumadocs-ui/components/tabs';

export function getMDXComponents(components: MDXComponents): MDXComponents {
  return {
    ...defaultMdxComponents,
    Steps,
    Step,
    Tabs,
    Tab,
    ...components,
  };
}
