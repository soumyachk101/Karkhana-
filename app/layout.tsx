import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Karkhana',
  description: 'Orchestrate parallel Claude Code agents across local repos',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="h-full overflow-hidden">{children}</body>
    </html>
  );
}
