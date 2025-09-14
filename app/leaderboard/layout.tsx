import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Leaderboard - The Aquarium',
  description: 'Guild member rankings and statistics',
};

export default function LeaderboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}