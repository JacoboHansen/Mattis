import { NextRequest, NextResponse } from 'next/server';

import {
  ACTIVE_LEARNER_COOKIE,
  ACCESS_COOKIE,
} from '../../../../lib/auth-cookies';
import { createTutorDataClient } from '../../../../lib/supabase/data';
import {
  nextWeeklyOccurrence,
  OSLO_TIMEZONE,
  parseWeeklyScheduleText,
  weeklyRecurrenceRule,
} from '../../../../lib/scheduling';
import {
  ensureFamilyAccount,
  getAuthUser,
  SupabaseHttpError,
  updateLearnerIntake,
} from '../../../../lib/supabase-http';
import { isUuid } from '../../../../lib/uuid';

const INTAKE_STEPS = new Set([
  'goal',
  'confidence',
  'learning_style',
  'work_mode',
  'frequency',
  'duration',
  'schedule_mode',
  'schedule',
  'school',
  'homework',
  'done',
]);

export async function POST(request: NextRequest) {
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!accessToken)
    return NextResponse.json(
      { error: 'Økten din har utløpt.' },
      { status: 401 },
    );
  const body = (await request.json().catch(() => ({}))) as {
    intakeStep?: unknown;
    intakeData?: unknown;
    complete?: unknown;
    sessionId?: unknown;
    studentText?: unknown;
    tutorText?: unknown;
    studentClientMessageId?: unknown;
    tutorClientMessageId?: unknown;
  };
  if (
    typeof body.intakeStep !== 'string' ||
    !INTAKE_STEPS.has(body.intakeStep) ||
    !body.intakeData ||
    typeof body.intakeData !== 'object' ||
    Array.isArray(body.intakeData)
  ) {
    return NextResponse.json(
      { error: 'Bli-kjent-svaret er ugyldig.' },
      { status: 400 },
    );
  }
  const intakeData = body.intakeData as Record<string, unknown>;
  if (JSON.stringify(intakeData).length > 12_000) {
    return NextResponse.json(
      { error: 'Bli-kjent-svaret er for langt.' },
      { status: 400 },
    );
  }
  const sessionId =
    typeof body.sessionId === 'string' ? body.sessionId.trim() : null;
  const studentText =
    typeof body.studentText === 'string' ? body.studentText.trim() : null;
  const tutorText =
    typeof body.tutorText === 'string' ? body.tutorText.trim() : null;
  const studentClientMessageId =
    typeof body.studentClientMessageId === 'string'
      ? body.studentClientMessageId.trim()
      : null;
  const tutorClientMessageId =
    typeof body.tutorClientMessageId === 'string'
      ? body.tutorClientMessageId.trim()
      : null;
  if (
    sessionId !== null &&
    (!isUuid(sessionId) ||
      !studentText ||
      studentText.length > 8_000 ||
      !tutorText ||
      tutorText.length > 8_000 ||
      !studentClientMessageId ||
      !isUuid(studentClientMessageId) ||
      !tutorClientMessageId ||
      !isUuid(tutorClientMessageId))
  ) {
    return NextResponse.json(
      { error: 'Bli-kjent-samtalen kunne ikke lagres.' },
      { status: 400 },
    );
  }
  try {
    const user = await getAuthUser(accessToken);
    const learners = await ensureFamilyAccount(accessToken, user.id);
    const requestedLearnerId = request.cookies.get(
      ACTIVE_LEARNER_COOKIE,
    )?.value;
    const learner =
      learners.find((candidate) => candidate.id === requestedLearnerId) ??
      learners[0];
    await updateLearnerIntake(accessToken, user.id, learner.id, {
      intakeStep: body.intakeStep,
      intakeData,
      complete: body.complete === true,
    });

    let schedulesCreated = 0;
    let scheduleNeedsSetup = false;
    if (
      intakeData.scheduleMode === 'fixed' &&
      typeof intakeData.schedule === 'string'
    ) {
      const parsedSchedules = parseWeeklyScheduleText(
        intakeData.schedule,
      ).slice(0, 4);
      if (!parsedSchedules.length) {
        scheduleNeedsSetup = true;
      } else {
        try {
          const data = createTutorDataClient({
            accessToken,
            userId: user.id,
            learnerId: learner.id,
          });
          const existingSchedules = await data.listSchedules(100);
          const durationMinutes =
            typeof intakeData.sessionMinutes === 'number' &&
            Number.isInteger(intakeData.sessionMinutes) &&
            intakeData.sessionMinutes >= 10 &&
            intakeData.sessionMinutes <= 180
              ? intakeData.sessionMinutes
              : 45;
          const created = await Promise.all(
            parsedSchedules.map(async ({ weekday, localTime }) => {
              const recurrenceRule = weeklyRecurrenceRule(
                weekday,
                localTime,
                OSLO_TIMEZONE,
              );
              if (
                existingSchedules.some(
                  (schedule) =>
                    schedule.recurrence_rule === recurrenceRule &&
                    schedule.enabled,
                )
              ) {
                return false;
              }
              const startsAt = nextWeeklyOccurrence(
                weekday,
                localTime,
                new Date(),
                OSLO_TIMEZONE,
              );
              if (!startsAt) return false;
              const schedule = await data.createSchedule({
                startsAt: startsAt.toISOString(),
                durationMinutes,
                recurrenceRule,
              });
              await data.createSession({
                durationMinutes,
                plannedAt: startsAt.toISOString(),
                startImmediately: false,
                scheduleId: schedule.id,
                planSnapshot: {
                  version: 'scheduled-session.v0.1',
                  mode: 'scheduled',
                },
              });
              return true;
            }),
          );
          schedulesCreated = created.filter(Boolean).length;
        } catch {
          // The intake is still useful if parsing or calendar persistence has
          // a transient problem. The client can show the normal scheduler.
          scheduleNeedsSetup = true;
        }
      }
    }
    if (
      sessionId &&
      studentText &&
      tutorText &&
      studentClientMessageId &&
      tutorClientMessageId
    ) {
      const data = createTutorDataClient({
        accessToken,
        userId: user.id,
        learnerId: learner.id,
      });
      const session = await data.getSession(sessionId);
      if (!session) {
        return NextResponse.json(
          { error: 'Bli-kjent-samtalen finnes ikke.' },
          { status: 404 },
        );
      }
      await data.appendMessage(sessionId, {
        role: 'student',
        contentNb: studentText,
        clientMessageId: studentClientMessageId,
      });
      await data.appendMessage(sessionId, {
        role: 'tutor',
        contentNb: tutorText,
        clientMessageId: tutorClientMessageId,
      });
      if (body.complete === true) {
        await data.updateSession(sessionId, { currentPhase: 'homework' });
      }
    }
    return NextResponse.json({
      ok: true,
      schedulesCreated,
      scheduleNeedsSetup,
    });
  } catch (error) {
    const status = error instanceof SupabaseHttpError ? error.status : 500;
    return NextResponse.json(
      { error: 'Bli-kjent-svaret kunne ikke lagres.' },
      { status },
    );
  }
}
