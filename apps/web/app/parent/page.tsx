import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getAuthenticatedParent } from '../../lib/request-auth';

export default async function ParentPage() {
  let parent;
  try {
    parent = await getAuthenticatedParent();
  } catch {
    redirect('/');
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="icon-button" href="/profiles" aria-label="Tilbake til elevprofiler">
          ←
        </Link>
        <h1 className="display topbar-title">Foreldreinnstillinger</h1>
        <span aria-hidden="true" />
      </header>
      <main className="page-wrap narrow app-content">
        <p className="eyebrow">Familiekonto</p>
        <h1>Oversikt kommer snart</h1>
        <p className="secondary-text">
          Her samler vi senere betaling, abonnement og innstillinger for familien.
        </p>
        <section className="card parent-settings-card">
          <strong>
            {parent.learners.length} elevprofil{parent.learners.length === 1 ? '' : 'er'}
          </strong>
          <span>Profiler og læringsdata holdes adskilt mellom elevene.</span>
        </section>
        <Link className="button secondary" href="/profiles">
          Bytt elevprofil
        </Link>
      </main>
    </div>
  );
}
