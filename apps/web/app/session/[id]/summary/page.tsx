import MattisApp from '../../../components/mattis-app';

export default async function SummaryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MattisApp screen="summary" sessionId={id} />;
}
