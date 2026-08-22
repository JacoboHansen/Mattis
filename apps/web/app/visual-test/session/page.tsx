import { notFound } from 'next/navigation';

import MattisApp from '../../components/mattis-app';

export const dynamic = 'force-dynamic';

/**
 * Synthetic visual-test entry point. It never loads a user or talks to Supabase.
 * Vercel production deployments must not expose this route, even to callers
 * that happen to have an authenticated session.
 */
export default function SyntheticSessionTestPage() {
  if (process.env.VERCEL_ENV === 'production') notFound();

  return <MattisApp screen="session" visualTest />;
}
