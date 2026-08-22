import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Mattis',
  description: 'En roligere måte å få grep om matten på.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="nb">
      <body>{children}</body>
    </html>
  );
}
