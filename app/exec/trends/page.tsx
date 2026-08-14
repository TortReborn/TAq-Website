import { redirect } from 'next/navigation';

/**
 * Trends moved under Activity, which is where the member roster lives — the
 * two are the same question at different zoom levels. Kept as a redirect so
 * any bookmark or pasted link still lands somewhere useful.
 */
export default function TrendsRedirect() {
  redirect('/exec/activity/trends');
}
