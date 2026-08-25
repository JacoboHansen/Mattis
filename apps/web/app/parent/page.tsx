import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getAuthenticatedParent } from '../../lib/request-auth';
import { getBillingAccount, toClientBillingStatus } from '../../lib/billing';

export default async function ParentPage() {
  let parent;
  try {
    parent = await getAuthenticatedParent();
  } catch {
    redirect('/');
  }

  const billing = toClientBillingStatus(await getBillingAccount(parent.accessToken, parent.user.id));

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
        <h1>Foreldrekonto</h1>
        <p className="secondary-text">
          Her administrerer du abonnementet og elevprofilene i familien.
        </p>
        <section className="card parent-settings-card">
          <strong>
            {parent.learners.length} elevprofil{parent.learners.length === 1 ? '' : 'er'}
          </strong>
          <span>Profiler og læringsdata holdes adskilt mellom elevene.</span>
        </section>
        <section className="card parent-settings-card">
          <strong>{billing.hasAccess ? 'Mattis er aktivt' : 'Mattis trenger et abonnement'}</strong>
          <span>
            {billing.status === 'trialing'
              ? 'Prøveuken er aktiv. Du blir ikke belastet før prøveperioden er over.'
              : billing.hasAccess
                ? 'Betaling og oppsigelse administreres trygt hos Stripe.'
                : 'Start en gratis prøveuke for å åpne matteøktene.'}
          </span>
          <Link className="button secondary" href="/billing">
            {billing.hasAccess ? 'Administrer abonnement' : 'Se prøveuke'}
          </Link>
        </section>
        <Link className="button secondary" href="/profiles">
          Bytt elevprofil
        </Link>
      </main>
    </div>
  );
}
