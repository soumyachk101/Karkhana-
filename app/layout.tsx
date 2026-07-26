import type { Metadata, Viewport } from 'next';
import { THEME_BOOT_SCRIPT } from '@/lib/theme';
import './globals.css';

export const metadata: Metadata = {
  title: 'Karkhana — parallel Claude Code agents',
  description: 'Orchestrate parallel Claude Code agents across local repos',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#17171a' },
    { media: '(prefers-color-scheme: light)', color: '#faf9f5' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Sets data-theme before first paint. Without it a reload flashes the
            dark palette at light-theme users, which is worse than it sounds on
            a full-screen dashboard. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="h-full overflow-hidden">{children}</body>
    </html>
  );
}
