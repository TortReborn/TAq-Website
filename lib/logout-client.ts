'use client';

/**
 * Sign out from a click handler. Logging out is a state change, so it goes
 * over POST: a plain GET link could be triggered by any third-party page
 * (an <img src>, a redirect) to sign a member out without their say-so.
 * Keep the anchor's href for middle-click/open-in-new-tab discoverability;
 * this handler intercepts the ordinary click.
 */
export async function logoutAndRedirect(event?: { preventDefault: () => void }): Promise<void> {
  event?.preventDefault();
  try {
    await fetch('/api/auth/discord/logout', { method: 'POST', credentials: 'same-origin' });
  } finally {
    window.location.href = '/login';
  }
}
