import { NextRequest, NextResponse } from 'next/server';

import {
  getAuthenticatedTutorData,
  RequestAuthError,
} from '../../../../lib/request-auth';
import { resolveChildSafetyConsent } from '../../../../lib/safety';
import { isUuid } from '../../../../lib/uuid';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    eventId?: unknown;
    consent?: unknown;
  };
  if (
    typeof body.eventId !== 'string' ||
    !isUuid(body.eventId) ||
    typeof body.consent !== 'boolean'
  ) {
    return NextResponse.json(
      { error: 'Sikkerhetssvaret er ugyldig.' },
      { status: 400 },
    );
  }
  try {
    const { user, learner } = await getAuthenticatedTutorData({
      requireBilling: true,
    });
    const result = await resolveChildSafetyConsent({
      userId: user.id,
      learnerId: learner.id,
      eventId: body.eventId,
      consent: body.consent,
      parentEmail: user.email,
    });
    if (!result.ok)
      return NextResponse.json(
        { error: 'Forespørselen finnes ikke.' },
        { status: 404 },
      );
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof RequestAuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { error: 'Sikkerhetssvaret kunne ikke lagres.' },
      { status: 503 },
    );
  }
}
