import type { Metadata, Viewport } from 'next';
import PwaInstallPrompt from './components/pwa-install-prompt';
import './globals.css';

export const metadata: Metadata = {
  title: 'Mattis',
  description: 'En roligere måte å få grep om matten på.',
  applicationName: 'Mattis',
  appleWebApp: {
    capable: true,
    title: 'Mattis',
    statusBarStyle: 'default',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#fff9f2',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="nb">
      <body>
        {children}
        <PwaInstallPrompt />
      </body>
    </html>
  );
}
