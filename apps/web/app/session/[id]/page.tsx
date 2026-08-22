import MattisApp from '../../components/mattis-app';

export default async function SessionPage({
  searchParams,
}: {
  searchParams: Promise<{ task?: string }>;
}) {
  const { task } = await searchParams;
  return <MattisApp screen="session" initialGeometry={task === 'geometry'} />;
}
