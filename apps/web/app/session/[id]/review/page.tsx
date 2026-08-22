import MattisApp from '../../../components/mattis-app';

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MattisApp screen="review" sessionId={id} />;
}
