import {
  getAuthenticatedTutorData,
  RequestAuthError,
} from '../../../../../lib/request-auth';
import { TutorDataError } from '../../../../../lib/supabase/data';
import { isUuid } from '../../../../../lib/uuid';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

type SetupStep = 'homework' | 'photos';

function parseSetupInput(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  if (
    Object.keys(source).some(
      (key) => !['durationMinutes', 'step'].includes(key),
    )
  ) {
    return null;
  }
  const durationMinutes = source.durationMinutes;
  const step = source.step;
  if (
    durationMinutes !== undefined &&
    (typeof durationMinutes !== 'number' ||
      ![25, 45, 60].includes(durationMinutes))
  ) {
    return null;
  }
  if (step !== undefined && step !== 'homework' && step !== 'photos') {
    return null;
  }
  if (durationMinutes === undefined && step === undefined) return null;
  return {
    durationMinutes:
      typeof durationMinutes === 'number' ? durationMinutes : null,
    step: (step as SetupStep | undefined) ?? null,
  };
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Ugyldig økt-ID.' }, 400);
  const setup = parseSetupInput(await request.json().catch(() => undefined));
  if (!setup) {
    return json(
      { error: 'Velg en øktlengde eller fortell om dere har lekser.' },
      400,
    );
  }

  try {
    const { data } = await getAuthenticatedTutorData({ requireBilling: true });
    const session = await data.getSession(id);
    if (!session) return json({ error: 'Økten finnes ikke.' }, 404);
    if (!['planned', 'capturing'].includes(session.status)) {
      return json({ error: 'Økten kan ikke endres nå.' }, 409);
    }
    const updated = await data.updateSession(id, {
      ...(setup.durationMinutes !== null
        ? { durationMinutes: setup.durationMinutes }
        : {}),
      currentPhase: setup.step === 'photos' ? 'setup_photos' : 'setup_homework',
    });
    return json({
      durationMinutes: updated.duration_minutes,
      step: setup.step ?? 'homework',
    });
  } catch (error) {
    if (error instanceof RequestAuthError || error instanceof TutorDataError) {
      return json({ error: error.message }, error.status);
    }
    return json({ error: 'Økttiden kunne ikke lagres.' }, 503);
  }
}
