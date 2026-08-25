import {
  createCheckoutSession,
  getBillingAccount,
  isBillingEntitled,
  saveBillingAccountAdmin,
} from '../../../../lib/billing';
import { getAuthenticatedParent, RequestAuthError } from '../../../../lib/request-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const onboarding = new URL(request.url).searchParams.get('onboarding') === '1';
  try {
    const { accessToken, user, learners } = await getAuthenticatedParent();
    const account = await getBillingAccount(accessToken, user.id);
    if (isBillingEntitled(account)) {
      return Response.json(
        { error: 'Familien har allerede tilgang. Administrer abonnementet fra foreldresiden.' },
        { status: 409 },
      );
    }

    const session = await createCheckoutSession({
      userId: user.id,
      email: user.email,
      learnerCount: Math.max(1, learners.length),
      customerId: account?.stripe_customer_id,
      onboarding,
    });
    await saveBillingAccountAdmin({
      userId: user.id,
      stripeCustomerId: session.customerId,
    });
    return Response.json({ url: session.url }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof RequestAuthError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error('Stripe checkout unavailable', {
      message: error instanceof Error ? error.message : 'unknown',
    });
    return Response.json(
      { error: 'Vi klarte ikke å åpne Stripe akkurat nå. Prøv igjen om litt.' },
      { status: 503 },
    );
  }
}
