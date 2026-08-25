import { redirect } from 'next/navigation';

import MattisApp, { type BillingScreenData } from '../components/mattis-app';
import { getBillingAccount, toClientBillingStatus } from '../../lib/billing';
import { getAuthenticatedParent } from '../../lib/request-auth';

export const dynamic = 'force-dynamic';

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  let parent;
  try {
    parent = await getAuthenticatedParent();
  } catch {
    redirect('/');
  }
  const account = await getBillingAccount(parent.accessToken, parent.user.id);
  const status =
    searchParams && (await searchParams).status === 'success'
      ? 'success'
      : searchParams && (await searchParams).status === 'cancelled'
        ? 'cancelled'
        : null;
  const initialBilling: BillingScreenData = {
    billing: toClientBillingStatus(account),
    learnerCount: parent.learners.length,
    checkoutStatus: status,
  };
  return <MattisApp screen="billing" initialBilling={initialBilling} />;
}
