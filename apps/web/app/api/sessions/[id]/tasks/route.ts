import { getAuthenticatedTutorData, RequestAuthError } from '../../../../../lib/request-auth';
import { TutorDataError } from '../../../../../lib/supabase/data';
import { isUuid } from '../../../../../lib/uuid';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}

function parseTasks(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  if (Object.keys(source).some((key) => key !== 'tasks') || !Array.isArray(source.tasks)) {
    return null;
  }
  if (source.tasks.length > 30) return null;
  const tasks: Array<{ id: string; text: string }> = [];
  for (const item of source.tasks) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const task = item as Record<string, unknown>;
    if (
      Object.keys(task).some((key) => !['id', 'text'].includes(key)) ||
      typeof task.id !== 'string' ||
      !isUuid(task.id) ||
      typeof task.text !== 'string' ||
      task.text.trim().length < 1 ||
      task.text.length > 4_000
    ) {
      return null;
    }
    tasks.push({ id: task.id, text: task.text.trim() });
  }
  return tasks;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Ugyldig økt-ID.' }, 400);
  const tasks = parseTasks(await request.json().catch(() => undefined));
  if (!tasks) return json({ error: 'Oppgavelisten er ugyldig.' }, 400);
  try {
    const { data } = await getAuthenticatedTutorData();
    const [session, storedTasks] = await Promise.all([
      data.getSession(id),
      data.listTasks(id, 100),
    ]);
    if (!session) return json({ error: 'Økten finnes ikke.' }, 404);
    if (session.status === 'completed' || session.status === 'cancelled') {
      return json({ error: 'Økten er avsluttet.' }, 409);
    }
    const storedById = new Map(storedTasks.map((task) => [task.id, task]));
    if (tasks.some((task) => !storedById.has(task.id))) {
      return json({ error: 'Oppgavelisten inneholder en ukjent oppgave.' }, 409);
    }
    const keptIds = new Set(tasks.map((task) => task.id));
    await Promise.all([
      ...storedTasks
        .filter((task) => !keptIds.has(task.id) && task.origin !== 'planned_review')
        .map((task) => data.deleteTask(task.id)),
      ...tasks.map((task) =>
        data.updateTask(task.id, {
          sourceText: task.text,
          normalizedText: task.text,
          status: 'confirmed',
        }),
      ),
    ]);
    const updated = await data.listTasks(id, 100);
    return json({
      tasks: updated.map((task) => ({ id: task.id, text: task.normalized_text })),
    });
  } catch (error) {
    if (error instanceof RequestAuthError || error instanceof TutorDataError) {
      return json({ error: error.message }, error.status);
    }
    return json({ error: 'Oppgavelisten kunne ikke lagres.' }, 503);
  }
}
