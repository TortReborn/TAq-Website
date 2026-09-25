/**
 * Onboarding Tour Steps
 *
 * Edit the title and description for each step here.
 * The tour highlights elements in order — each step targets a
 * `data-tour="<target>"` attribute in the exec dashboard.
 *
 * Positions: 'center' = centered modal, 'right' = right of target, 'bottom' = below target
 */

export interface TourStep {
  id: string;
  target: string | null;
  title: string;
  description: string;
  position: 'center' | 'right' | 'bottom';
}

const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    target: null,
    title: 'Welcome to the Exec Dashboard',
    description: 'Use this dashboard to manage members, guild activity, economy, and internal requests.',
    position: 'center',
  },
  {
    id: 'stats',
    target: 'stats',
    title: 'At a Glance',
    description: 'These cards show pending applications, total members, and who is online now.',
    position: 'bottom',
  },
  {
    id: 'recent-apps',
    target: 'recent-apps',
    title: 'Recent Applications',
    description: 'New applications appear here with their vote counts. Open one to review it and vote.',
    position: 'bottom',
  },
  {
    id: 'nav-members',
    target: 'nav-members',
    title: 'Members',
    description: 'Review applications, track activity, handle promotions, and manage the blacklist.',
    position: 'right',
  },
  {
    id: 'nav-activities',
    target: 'nav-activities',
    title: 'Activities',
    description: 'Log guild raids, manage raid events, review territory snipes, and track guild-bank inventory.',
    position: 'right',
  },
  {
    id: 'nav-economy',
    target: 'nav-economy',
    title: 'Economy',
    description: 'Manage shell balances, exchange rates, profile backgrounds, ingredient stock, and guild accounting.',
    position: 'right',
  },
  {
    id: 'nav-operations',
    target: 'nav-operations',
    title: 'Operations',
    description: 'Manage meeting topics and track bugs or feature requests for the bot, mod, and website.',
    position: 'right',
  },
  {
    id: 'finish',
    target: null,
    title: 'Tour complete',
    description: 'Replay this tour from the ? button at the bottom of the sidebar.',
    position: 'center',
  },
];

export default TOUR_STEPS;
