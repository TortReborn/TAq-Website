// Force dynamic rendering for map page - fetches territory data
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function MapLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
