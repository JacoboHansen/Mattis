import MattisApp from '../../components/mattis-app';

export default async function SessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ task?: string }>;
}) {
  const { id } = await params;
  const { task } = await searchParams;
  return <MattisApp screen="session" initialGeometry={task === 'geometry'} sessionId={id} />;
}
