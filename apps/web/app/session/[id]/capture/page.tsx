import MattisApp from '../../../components/mattis-app';

export default async function CapturePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MattisApp screen="capture" sessionId={id} />;
}
