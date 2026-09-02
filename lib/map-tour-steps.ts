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
    description: 'The map can replay the war for every territory going back years. This quick tour shows you the controls — it only takes a few seconds.',
    position: 'center',
  },
  {
    id: 'timeline',
    target: 'history-timeline',
    title: 'The timeline',
    description: 'Drag or click the bar to jump to any moment, or play back history at your chosen speed. The colored strip shows seasons — right-click one to zoom in — and event dots zoom to their event when clicked.',
    position: 'bottom',
  },
  {
    id: 'chronicle',
    target: 'chronicle-toggle',
    title: 'Chronicle',
    description: 'Community-maintained history: alliances and events like wars. Toggle it to tint territories by the alliances that existed at the shown moment and to see event markers on the timeline. You can propose new entries or edits — an exec reviews them before they appear.',
    position: 'bottom',
  },
  {
    id: 'factions',
    target: 'factions-toggle',
    title: 'Factions',
    description: 'Build your own guild groupings and color the map by them — handy for tracking coalitions the Chronicle doesn\'t cover yet.',
    position: 'bottom',
  },
  {
    id: 'settings',
    target: 'map-settings-toggle',
    title: 'Map settings',
    description: 'Territory fills, guild names, trade routes, resource outlines, recent-capture highlights and more — tune the map to show exactly what you care about.',
    position: 'bottom',
  },
];

export default MAP_TOUR_STEPS;
