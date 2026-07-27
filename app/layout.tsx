import type { Metadata } from 'next';
import { Public_Sans, Space_Grotesk } from 'next/font/google';
import { Analytics } from '@vercel/analytics/react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Karkhana | SaaS Multi-Agent Engine',
  description: 'Orchestrate parallel Claude Code, Antigravity, and Codex agents across local and cloud repos',
};

// Body/UI text: a humanist sans built for clarity at small, dense sizes —
// most of this UI runs at 10–12px. Display: a geometric face with more
// mechanical character, used sparingly for the wordmark and titles only.
const publicSans = Public_Sans({ subsets: ['latin'], variable: '--font-public-sans', display: 'swap' });
const spaceGrotesk = Space_Grotesk({ subsets: ['latin'], variable: '--font-space-grotesk', display: 'swap' });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${publicSans.variable} ${spaceGrotesk.variable}`}>
      <body className="h-full overflow-hidden">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
