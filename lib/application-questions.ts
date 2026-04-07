export interface ApplicationQuestion {
  id: string;
  label: string;
  type: 'text' | 'textarea' | 'checkbox' | 'select';
  placeholder?: string;
  required: boolean;
  maxLength?: number;
  minLength?: number;
  options?: string[];
}

export const GUILD_QUESTIONS: ApplicationQuestion[] = [
  {
    id: 'ign',
    label: 'IGN',
    type: 'text',
    placeholder: 'Your Wynncraft username',
    required: true,
    maxLength: 16,
  },
  {
    id: 'timezone',
    label: 'Timezone (in relation to GMT)',
    type: 'text',
    placeholder: 'e.g., GMT-5, GMT+1',
    required: true,
    maxLength: 20,
  },
  {
    id: 'age',
    label: 'Age (optional)',
    type: 'text',
    placeholder: '',
    required: false,
    maxLength: 10,
  },
  {
    id: 'playtime',
    label: 'Estimated playtime per day',
    type: 'text',
    placeholder: 'e.g., 2-3 hours',
    required: true,
    maxLength: 100,
  },
  {
    id: 'guild_experience',
    label: 'Do you have any previous guild experience (name of the guild, rank, reason for leaving)?',
    type: 'textarea',
    placeholder: '',
    required: true,
    maxLength: 250,
  },
  {
    id: 'warring',
    label: 'Are you interested in warring? If so, do you already have experience?',
    type: 'textarea',
    placeholder: '',
    required: true,
    maxLength: 250,
  },
  {
    id: 'know_about_taq',
    label: 'What do you know about TAq?',
    type: 'textarea',
    placeholder: '',
    required: true,
    maxLength: 250,
  },
  {
    id: 'gain_from_taq',
    label: 'What would you like to gain from joining TAq?',
    type: 'textarea',
    placeholder: '',
    required: true,
    maxLength: 250,
  },
  {
    id: 'contribute',
    label: 'What would you contribute to TAq?',
    type: 'textarea',
    placeholder: '',
    required: true,
    maxLength: 250,
  },
  {
    id: 'anything_else',
    label: 'Anything else you would like to tell us? (optional)',
    type: 'textarea',
    placeholder: '',
    required: false,
    maxLength: 250,
  },
  {
    id: 'reference',
    label: 'How did you learn about TAq/reference for application? If recruited via party finder, include the recruiter\'s IGN.',
    type: 'text',
    placeholder: '',
    required: true,
    maxLength: 250,
  },
];

export const COMMUNITY_QUESTIONS: ApplicationQuestion[] = [
  {
    id: 'ign',
    label: 'What is your IGN?',
    type: 'text',
    placeholder: 'Your Wynncraft username',
    required: true,
    maxLength: 16,
  },
  {
    id: 'guild',
    label: 'What guild are you in?',
    type: 'text',
    placeholder: '',
    required: true,
    maxLength: 100,
  },
  {
    id: 'why_community',
    label: 'Why do you want to become a community member of TAq?',
    type: 'textarea',
    placeholder: '',
    required: true,
    maxLength: 250,
  },
  {
    id: 'contribute',
    label: 'What would you contribute to the community?',
    type: 'textarea',
    placeholder: '',
    required: true,
    maxLength: 250,
  },
  {
    id: 'anything_else',
    label: 'Is there anything else you want to say? (optional)',
    type: 'textarea',
    placeholder: '',
    required: false,
    maxLength: 250,
  },
];

// ---------------------------------------------------------------------------
// Hammerhead Application Questions
// ---------------------------------------------------------------------------

export const HAMMERHEAD_TASK_OPTIONS = ['Recruitment', 'Wars', 'Events', 'Ing/Mat Grinding', 'Raid'] as const;

export const HAMMERHEAD_GENERAL_QUESTIONS: ApplicationQuestion[] = [
  {
    id: 'hh_ign_rank',
    label: 'What is your IGN and current rank in TAq?',
    type: 'text',
    placeholder: 'e.g., kioabc1, Angler',
    required: true,
    maxLength: 50,
  },
  {
    id: 'hh_candidate_fit',
    label: 'What makes you a good candidate and fit for the Hammerhead role?',
    type: 'textarea',
    required: true,
    maxLength: 1000,
  },
  {
    id: 'hh_hr_meaning',
    label: 'In your own words, what does being HR mean and why do you want to be part of it?',
    type: 'textarea',
    required: true,
    maxLength: 1000,
  },
  {
    id: 'hh_missing_hr',
    label: 'Do you think there is currently something missing in the HR team that you believe you can help address? Elaborate.',
    type: 'textarea',
    required: true,
    maxLength: 1000,
  },
  {
    id: 'hh_conflict',
    label: 'Conflict between members, especially in a guild of this size, is often unavoidable. Generally speaking, how would you work to address and solve a conflict between two members?',
    type: 'textarea',
    required: true,
    maxLength: 1000,
  },
  {
    id: 'hh_vibe',
    label: 'What would you describe as the overall vibe of TAq given your interactions with the members and community?',
    type: 'textarea',
    required: true,
    maxLength: 1000,
  },
];

export const HAMMERHEAD_TASK_SELECTOR: ApplicationQuestion = {
  id: 'hh_tasks',
  label: 'What kinds of Hammerhead tasks would you like to focus on? Choose all that apply to you and answer the questions in the sections that correspond to your interest areas.',
  type: 'checkbox',
  required: true,
  options: [...HAMMERHEAD_TASK_OPTIONS],
};

export const HAMMERHEAD_SECTION_QUESTIONS: Record<string, ApplicationQuestion[]> = {
  'Recruitment': [
    {
      id: 'hh_recruit_experience',
      label: 'Do you have experience doing any kind of recruitment in the past? If so, please elaborate.',
      type: 'textarea',
      required: false,
      maxLength: 1000,
    },
    {
      id: 'hh_recruit_strategies',
      label: 'What are some recruitment strategies and how do you effectively use them?',
      type: 'textarea',
      required: false,
      maxLength: 1000,
    },
    {
      id: 'hh_recruit_retention',
      label: 'How do you make sure initially recruited members are more likely to stay around?',
      type: 'textarea',
      required: false,
      maxLength: 1000,
    },
  ],
  'Wars': [
    {
      id: 'hh_war_importance',
      label: 'Why is participating in wars important for a guild?',
      type: 'textarea',
      required: true,
      maxLength: 1000,
    },
    {
      id: 'hh_war_experience',
      label: 'How much war experience do you have? You can list war count, whether you\'ve done HQ snipes and snaking, etc. How successful have you been in the past?',
      type: 'textarea',
      required: true,
      maxLength: 1000,
    },
    {
      id: 'hh_eco_knowledge',
      label: 'Do you know how to eco / the basics of it?',
      type: 'select',
      required: true,
      options: [
        'No, I don\'t',
        'Yes, somewhat (Basic understanding of resource ticks but limited hands-on experience)',
        'Yes, I am confident (Knows about resource ticks, optimal setups, can confidently eco when defending a claim)',
      ],
    },
    {
      id: 'hh_war_teaching',
      label: 'Are you interested in teaching new members how to war? If so, how would you go about teaching others?',
      type: 'textarea',
      required: false,
      maxLength: 1000,
    },
  ],
  'Events': [
    {
      id: 'hh_event_ideas',
      label: 'Do you have any current ideas for events the guild could do right now? Please elaborate if so.',
      type: 'textarea',
      required: false,
      maxLength: 1000,
    },
    {
      id: 'hh_event_success',
      label: 'What makes for a fun, successful event for a community, in your opinion?',
      type: 'textarea',
      required: false,
      maxLength: 1000,
    },
    {
      id: 'hh_event_experience',
      label: 'Do you have any previous experience in organizing events and/or skills you feel may be useful for it?',
      type: 'textarea',
      required: false,
      maxLength: 1000,
    },
  ],
  'Ing/Mat Grinding': [
    {
      id: 'hh_crafting_willing',
      label: 'Would you be willing to craft items used in wars and Annihilation events?',
      type: 'select',
      required: true,
      options: ['Yes', 'No'],
    },
    {
      id: 'hh_past_contributions',
      label: 'Have you contributed ings/mats in the past for the guild? If so, what kinds and how many?',
      type: 'textarea',
      required: false,
      maxLength: 1000,
    },
    {
      id: 'hh_gbank_tracking',
      label: 'Would you be comfortable in helping keep track of our inventory counts (gbank) and replenishing consumables / informing people with guild stock access in time so we never have a shortage?',
      type: 'select',
      required: true,
      options: ['Yes', 'No'],
    },
  ],
  'Raid': [
    {
      id: 'hh_raid_experience',
      label: 'What experience do you have raiding in the 4 different raids? Any experience raiding with guild members?',
      type: 'textarea',
      required: false,
      maxLength: 1000,
    },
    {
      id: 'hh_raid_teaching',
      label: 'A new player is in your raid party. How do you generally go about introducing them to the raid and helping them out?',
      type: 'textarea',
      required: false,
      maxLength: 1000,
    },
  ],
};

export const HAMMERHEAD_FINAL_QUESTIONS: ApplicationQuestion[] = [
  {
    id: 'hh_dedication',
    label: 'Are you willing to dedicate time outside of your server playtime to our meetings, potential discussions or the development of needed suggestions?',
    type: 'textarea',
    required: true,
    maxLength: 1000,
  },
  {
    id: 'hh_expertise',
    label: 'Is there any kind of expertise you have that is not currently needed by our HR but you think might be a big help to the guild and that you can imagine contributing with?',
    type: 'textarea',
    required: false,
    maxLength: 1000,
  },
];

/**
 * Returns a flat list of all hammerhead questions (all sections included)
 * for server-side validation.
 */
export function getAllHammerheadQuestions(): ApplicationQuestion[] {
  const allSectionQuestions = Object.values(HAMMERHEAD_SECTION_QUESTIONS).flat();
  return [
    ...HAMMERHEAD_GENERAL_QUESTIONS,
    HAMMERHEAD_TASK_SELECTOR,
    ...allSectionQuestions,
    ...HAMMERHEAD_FINAL_QUESTIONS,
  ];
}

export function getQuestionsForType(type: 'guild' | 'community' | 'hammerhead'): ApplicationQuestion[] {
  if (type === 'hammerhead') return getAllHammerheadQuestions();
  return type === 'guild' ? GUILD_QUESTIONS : COMMUNITY_QUESTIONS;
}
