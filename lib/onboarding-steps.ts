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
    description: "This is your command center for managing the guild. You can skip the tour if you want but if I get any DMs about stuff in this, I'll send Tort after you.",
    position: 'center',
  },
  {
    id: 'stats',
    target: 'stats',
    title: 'At a Glance',
    description: 'These cards show live stats — pending applications, total members, and who\'s online right now.',
    position: 'bottom',
  },
  {
    id: 'recent-apps',
    target: 'recent-apps',
    title: 'Recent Applications',
    description: 'New applications show up here with their vote counts. Click any application to review it and cast your vote.',
    position: 'bottom',
  },
  {
    id: 'nav-members',
    target: 'nav-members',
    title: 'Members',
    description: 'Everything member-related — review applications, track member activity, handle promotions, and manage the blacklist. These are the important ones, PLEASE VOTE ON APPS.',
    position: 'right',
  },
  {
    id: 'nav-activities',
    target: 'nav-activities',
    title: 'Activities',
    description: 'Manage guild raid events, log and review territory snipes, manage war builds, and track guild bank inventory. Great one stop shop for guild activities.',
    position: 'right',
  },
  {
    id: 'nav-economy',
    target: 'nav-economy',
    title: 'Economy',
    description: 'Manage the shell currency system — member balances, exchange rates, and profile background purchases (thank god old background management made me sad).',
    position: 'right',
  },
  {
    id: 'nav-operations',
    target: 'nav-operations',
    title: 'Operations',
    description: "Meeting agenda and Requests — report bugs or request features for the bot, mod, or website and track them all in one place.",
    position: 'right',
  },
  {
    id: 'finish',
    target: null,
    title: "That's the tour!",
    description: "You're all set. If you ever need a refresher, you can replay this tour anytime from the ? button in the bottom left of the sidebar.",
    position: 'center',
  },
];

export default TOUR_STEPS;
