export interface ApplicationQuestion {
  id: string;
  label: string;
  type: 'text' | 'textarea';
  placeholder?: string;
  required: boolean;
  maxLength?: number;
  minLength?: number;
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

export function getQuestionsForType(type: 'guild' | 'community'): ApplicationQuestion[] {
  return type === 'guild' ? GUILD_QUESTIONS : COMMUNITY_QUESTIONS;
}
