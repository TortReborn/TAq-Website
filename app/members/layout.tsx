// Force dynamic rendering for members page - fetches guild data
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function MembersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
