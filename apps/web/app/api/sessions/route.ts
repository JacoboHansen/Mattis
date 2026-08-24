import { handleCreateSession } from '../../../lib/session-handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return handleCreateSession(request);
}
