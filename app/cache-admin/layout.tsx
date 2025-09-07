// Force dynamic rendering for cache admin
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function CacheAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
