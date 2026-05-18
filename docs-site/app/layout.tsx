import type { ReactNode } from 'react';
import { RootProvider } from 'fumadocs-ui/provider';
import 'fumadocs-ui/style.css';

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="flex min-h-screen flex-col">
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
