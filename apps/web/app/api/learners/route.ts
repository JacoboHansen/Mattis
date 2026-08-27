import { NextRequest, NextResponse } from 'next/server';

import { normalizeCurriculumSelection } from '../../../lib/curriculum/catalog';
import {
  ageBandForGrade,
  parentTogetherRequired,
  type LearnerAgeBand,
} from '../../../lib/learner-profile';
import { getAuthenticatedParent } from '../../../lib/request-auth';
import { SupabaseHttpError } from '../../../lib/supabase-http';
import {
  getBillingAccount,
  isBillingEntitled,
  requestExtraLearnerPayment,
} from '../../../lib/billing';
import {
  createPendingLearner,
  finalizePendingLearner,
  markPendingLearnerFailed,
  setPendingLearnerInvoice,
} from '../../../lib/pending-learners';

export async function GET() {
  try {
    const { learners } = await getAuthenticatedParent();
    return NextResponse.json({ learners });
  } catch (error) {
    const status = error instanceof SupabaseHttpError ? error.status : 401;
    return NextResponse.json(
      { error: 'Vi klarte ikke å hente elevprofilene.' },
      { status },
    );
  }
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    displayName?: unknown;
    gradeLevel?: unknown;
    courseCode?: unknown;
    ageBand?: unknown;
    parentTogetherConfirmed?: unknown;
  };
  const displayName =
    typeof body.displayName === 'string' ? body.displayName.trim() : '';
  const gradeLevel = Number(body.gradeLevel);
  const courseCode =
    typeof body.courseCode === 'string' ? body.courseCode.trim() : null;
  const requestedAgeBand =
    body.ageBand === 'under_12' ||
    body.ageBand === '12_16' ||
    body.ageBand === '17_plus'
      ? body.ageBand
      : null;
  const ageBand: LearnerAgeBand =
    requestedAgeBand ?? ageBandForGrade(gradeLevel);
  const togetherConfirmed = body.parentTogetherConfirmed === true;
  const curriculum = normalizeCurriculumSelection(gradeLevel, courseCode);
  if (
    displayName.length < 1 ||
    displayName.length > 40 ||
    !curriculum ||
    (parentTogetherRequired(gradeLevel) &&
      (!togetherConfirmed || ageBand !== 'under_12'))
  ) {
    return NextResponse.json(
      {
        error: parentTogetherRequired(gradeLevel)
          ? 'Bekreft at eleven bruker Mattis sammen med en foresatt.'
          : 'Skriv inn navn, trinn og riktig matematikkfag.',
      },
      { status: 400 },
    );
  }

  try {
    const { accessToken, user, learners } = await getAuthenticatedParent();
    const billing = await getBillingAccount(accessToken, user.id).catch(
      () => null,
    );
    if (!billing || !isBillingEntitled(billing)) {
      return NextResponse.json(
        {
          error: 'Aktiver familiens abonnement før dere legger til en ny elev.',
          destination: '/billing',
        },
        { status: 402 },
      );
    }
    if (!billing.stripe_subscription_id) {
      return NextResponse.json(
        {
          error: 'Stripe-abonnementet er ikke klart ennå. Prøv igjen om litt.',
        },
        { status: 503 },
      );
    }

    const pending = await createPendingLearner({
      userId: user.id,
      displayName,
      gradeLevel,
      courseCode: curriculum.code,
      ageBand,
      parentTogetherConfirmed: togetherConfirmed,
      stripeSubscriptionId: billing.stripe_subscription_id,
    });
    try {
      const payment = await requestExtraLearnerPayment(
        billing,
        learners.length + 1,
        pending.id,
      );
      await setPendingLearnerInvoice(
        pending.id,
        payment.invoiceId,
        payment.subscriptionId,
      );
      if (payment.paid) {
        const learnerId = await finalizePendingLearner(pending.id);
        return NextResponse.json(
          {
            learner: learnerId ? { id: learnerId } : undefined,
            destination: '/onboarding',
          },
          { status: 201 },
        );
      }
      return NextResponse.json(
        {
          pendingLearnerId: pending.id,
          paymentUrl: payment.paymentUrl,
          destination: '/profiles?pending=1',
        },
        { status: 202 },
      );
    } catch (error) {
      await markPendingLearnerFailed(pending.id).catch(() => undefined);
      throw error;
    }
  } catch (error) {
    const status = error instanceof SupabaseHttpError ? error.status : 500;
    const message =
      status === 409
        ? 'Det finnes allerede en elev med dette navnet.'
        : error instanceof Error && error.message.includes('Stripe')
          ? 'Betalingen for den nye eleven kunne ikke startes.'
          : 'Elevprofilen kunne ikke klargjøres.';
    return NextResponse.json({ error: message }, { status });
  }
}
