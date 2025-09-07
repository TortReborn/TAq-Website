// Force dynamic rendering for lootpools page - fetches API data
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function LootpoolsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
