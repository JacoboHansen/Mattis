import {
  createCustomerPortalSession,
  getBillingAccount,
} from '../../../../lib/billing';
import { getAuthenticatedParent, RequestAuthError } from '../../../../lib/request-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const { accessToken, user } = await getAuthenticatedParent();
    const account = await getBillingAccount(accessToken, user.id);
    if (!account?.stripe_customer_id) {
      return Response.json({ error: 'Det finnes ikke noe abonnement å administrere ennå.' }, { status: 409 });
    }
    const url = await createCustomerPortalSession(account.stripe_customer_id);
    return Response.json({ url }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof RequestAuthError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error('Stripe portal unavailable', {
      message: error instanceof Error ? error.message : 'unknown',
    });
    return Response.json(
      { error: 'Vi klarte ikke å åpne abonnementsinnstillingene akkurat nå.' },
      { status: 503 },
    );
  }
}
