import { getBillingAccount, toClientBillingStatus } from '../../../../lib/billing';
import { getAuthenticatedParent, RequestAuthError } from '../../../../lib/request-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { accessToken, user, learners } = await getAuthenticatedParent();
    const account = await getBillingAccount(accessToken, user.id);
    return Response.json(
      {
        billing: toClientBillingStatus(account),
        learnerCount: learners.length,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    if (error instanceof RequestAuthError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json({ error: 'Betalingsstatus kunne ikke hentes.' }, { status: 503 });
  }
}
