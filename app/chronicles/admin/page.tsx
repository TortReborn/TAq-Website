import type { Metadata } from 'next';
import ChroniclesAdmin from '@/components/ChroniclesAdmin';

export const metadata: Metadata = {
  title: 'Chronicles — editorial',
  description: 'Review queue, unverified pages and chronicler management for the Chronicles.',
};

/**
 * Editorial desk for the Chronicles, deliberately here rather than under /exec.
 *
 * Chroniclers are often not in the guild, so they cannot be given exec access
 * just to approve a suggestion — /exec is the guild's own administration and
 * carries accounting, applications and member data. This page carries only the
 * wiki, and is reachable by anyone the guild has designated a chronicler.
 */
export default function ChroniclesAdminPage() {
  return <ChroniclesAdmin />;
}
