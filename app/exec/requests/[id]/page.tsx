import { redirect } from 'next/navigation';

export default async function RequestRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/exec/requests?ticket=${id}`);
}
