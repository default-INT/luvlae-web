import { notFound, redirect } from 'next/navigation';

interface Props { params: Promise<{ id: string }> }
export const dynamic = 'force-dynamic';

export default async function OrderRoute(props: Props) {
  const { id } = await props.params;

  if (!/^[a-f0-9]{24}$/.test(id)) notFound();

  redirect(`/admin/orders?order=${id}`);
}
