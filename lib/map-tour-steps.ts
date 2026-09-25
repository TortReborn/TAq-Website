/**
 * History Map Tour Steps
 *
 * Shown the first time someone opens the map's History view (and replayable
 * via the ? button). Each step targets a `data-tour="<target>"` attribute on
 * the map page; the shared OnboardingTour overlay renders the spotlight.
 */

import type { TourStep } from './onboarding-steps';

const MAP_TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    target: null,
    title: 'Welcome to History view',
    description: 'Replay years of territory ownership and wars. This tour covers the history controls.',
    position: 'center',
  },
  {
    id: 'timeline',
    target: 'history-timeline',
    title: 'The timeline',
    description: 'Drag or click the bar to move through time, or play history at your chosen speed. Right-click a season to zoom in. Select an event dot to jump to it.',
    position: 'bottom',
  },
  {
    id: 'chronicle',
    target: 'chronicle-toggle',
    title: 'Chronicle',
    description: 'Show community-maintained alliances and events for the selected date. You can suggest entries or edits for an admin to review.',
    position: 'bottom',
  },
  {
    id: 'factions',
    target: 'factions-toggle',
    title: 'Factions',
    description: 'Create guild groups and color the map by them. Use this for coalitions not covered by the Chronicle.',
    position: 'bottom',
  },
  {
    id: 'settings',
    target: 'map-settings-toggle',
    title: 'Map settings',
    description: 'Choose which territory fills, guild names, trade routes, resources, and recent captures the map shows.',
    position: 'bottom',
  },
];

export default MAP_TOUR_STEPS;
