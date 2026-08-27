import { notFound } from 'next/navigation';

import MattisApp from '../../components/mattis-app';

export const dynamic = 'force-dynamic';

/**
 * Synthetic visual-test entry point. It never loads a user or talks to Supabase.
 * Vercel production deployments must not expose this route, even to callers
 * that happen to have an authenticated session.
 */
export default function SyntheticSessionTestPage() {
  if (process.env.VERCEL_ENV === 'production') notFound();

  const sessionId = '11111111-1111-4111-8111-111111111111';
  return (
    <MattisApp
      screen="session"
      sessionId={sessionId}
      visualTest
      initialSession={{
        id: sessionId,
        status: 'active',
        currentPhase: 'homework',
        durationMinutes: 45,
        startedAt: null,
        endedAt: null,
        gradeLevel: 10,
        ageBand: '12_16',
        messages: [],
        tasks: [
          {
            id: '22222222-2222-4222-8222-222222222222',
            text: 'Løs \\(2(x - 3) = 4x + 6\\)',
            label: '4a',
            phase: 'homework',
            status: 'in_progress',
            taskType: 'equation',
            conceptKeys: ['algebra.equations'],
          },
          {
            id: '33333333-3333-4333-8333-333333333333',
            text: 'Regn ut −7 + 12 − 5, og forklar hvordan du tenker om fortegnene.',
            label: 'Repetisjon 1',
            phase: 'repetition',
            status: 'confirmed',
            taskType: 'open_response',
            conceptKeys: ['numbers.negative'],
          },
        ],
      }}
    />
  );
}
