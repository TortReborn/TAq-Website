import type { Metadata } from 'next';
import ChroniclesAdmin from '@/components/ChroniclesAdmin';

export const metadata: Metadata = {
  title: 'Chronicle — editorial desk',
  description: 'Pages still unchecked, sources not yet written up, and suggestions awaiting a decision.',
};

/**
 * Editorial desk for the Chronicle, deliberately here rather than under /exec.
 *
 * Chroniclers are often not in the guild, so they cannot be given exec access
 * just to approve a suggestion — /exec is the guild's own administration and
 * carries accounting, applications and member data. This page carries only the
 * wiki, and is reachable by anyone the guild has designated a chronicler.
 */
export default function ChroniclesAdminPage() {
  return <ChroniclesAdmin />;
}
