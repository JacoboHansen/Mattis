import { redirect } from 'next/navigation';

import MattisApp, { type BillingScreenData } from '../components/mattis-app';
import { getBillingAccount, toClientBillingStatus } from '../../lib/billing';
import { getAuthenticatedParent } from '../../lib/request-auth';

export const dynamic = 'force-dynamic';

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; onboarding?: string }>;
}) {
  let parent;
  try {
    parent = await getAuthenticatedParent();
  } catch {
    redirect('/');
  }
  const account = await getBillingAccount(parent.accessToken, parent.user.id);
  const params = await searchParams;
  const status =
    params.status === 'success'
      ? 'success'
      : params.status === 'cancelled'
        ? 'cancelled'
        : null;
  const initialBilling: BillingScreenData = {
    billing: toClientBillingStatus(account),
    learnerCount: parent.learners.length,
    checkoutStatus: status,
    onboarding: params.onboarding === '1',
  };
  return <MattisApp screen="billing" initialBilling={initialBilling} />;
}
