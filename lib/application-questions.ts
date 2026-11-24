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
      label: 'What experience do you have with Wynncraft\'s raids? Any experience raiding with guild members?',
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

// ---------------------------------------------------------------------------
// Editable forms (TAQ-217). The constants above are the defaults: a form uses
// them until a Narwhal saves a revision at /exec/application-forms, and the
// newest revision (lib/application-forms-db.ts) is live from then on. Client
// safe: types, the normalizer the API gates saves with, and the snapshot each
// submission stores for the bot (Tort-Reborn Tasks/check_website_apps.py).
// ---------------------------------------------------------------------------

export type FormType = 'guild' | 'community' | 'hammerhead';
export const FORM_TYPES: FormType[] = ['guild', 'community', 'hammerhead'];
export const FORM_NAMES: Record<FormType, string> = {
  guild: 'Guild member application',
  community: 'Community member application',
  hammerhead: 'Hammerhead application',
};

export interface SimpleForm { questions: ApplicationQuestion[] }
export interface HammerheadTask { name: string; questions: ApplicationQuestion[] }
export interface HammerheadForm {
  general: ApplicationQuestion[];
  /** The "which areas" checkbox question; its choices are the task names */
  task_label: string;
  tasks: HammerheadTask[];
  final: ApplicationQuestion[];
}
export type FormContent = SimpleForm | HammerheadForm;

export const TASKS_ID = HAMMERHEAD_TASK_SELECTOR.id;

/** Questions the bot reads by id: they can be reworded, never removed or retyped. */
export const LOCKED_IDS: Record<FormType, string> = { guild: 'ign', community: 'ign', hammerhead: 'hh_ign_rank' };

export const FORM_LIMITS = {
  label: 500,
  placeholder: 150,
  questions: 30,
  tasks: 10,
  taskName: 40,
  options: 25,
  option: 150,
  /** Highest answer length a form may allow, per answer type */
  text: 500,
  textarea: 2000,
} as const;

/** Answer types each form can render (the guild and community forms have no dropdowns). */
export function answerTypes(type: FormType): ApplicationQuestion['type'][] {
  return type === 'hammerhead' ? ['text', 'textarea', 'select'] : ['text', 'textarea'];
}

export function defaultForm(type: 'guild' | 'community'): SimpleForm;
export function defaultForm(type: 'hammerhead'): HammerheadForm;
export function defaultForm(type: FormType): FormContent;
export function defaultForm(type: FormType): FormContent {
  // A deep copy in the shape normalizeForm returns (no empty hints), so the
  // editor never sees the defaults as changed.
  const copy = <T,>(v: T): T => JSON.parse(JSON.stringify(v, (k, val) => (k === 'placeholder' && !val ? undefined : val)));
  if (type === 'guild') return { questions: copy(GUILD_QUESTIONS) };
  if (type === 'community') return { questions: copy(COMMUNITY_QUESTIONS) };
  return copy({
    general: HAMMERHEAD_GENERAL_QUESTIONS,
    task_label: HAMMERHEAD_TASK_SELECTOR.label,
    tasks: HAMMERHEAD_TASK_OPTIONS.map(name => ({ name, questions: HAMMERHEAD_SECTION_QUESTIONS[name] })),
    final: HAMMERHEAD_FINAL_QUESTIONS,
  });
}

export function taskSelector(form: HammerheadForm): ApplicationQuestion {
  return { id: TASKS_ID, label: form.task_label, type: 'checkbox', required: true, options: form.tasks.map(t => t.name) };
}

/** Every question of a form, in order (Hammerhead: all task areas). */
export function formQuestions(type: FormType, content: FormContent): ApplicationQuestion[] {
  if (type !== 'hammerhead') return (content as SimpleForm).questions;
  const hh = content as HammerheadForm;
  return [...hh.general, taskSelector(hh), ...hh.tasks.flatMap(t => t.questions), ...hh.final];
}

/** What a submission stores in applications.questions: the wording the
 *  applicant saw, so the bot labels answers from it and a later edit never
 *  relabels an old application. `task` marks a Hammerhead task area, shown
 *  only when the applicant picked it. */
export interface QuestionSnapshot {
  sections: { title: string | null; task: boolean; questions: { id: string; label: string }[] }[];
}

export function questionSnapshot(type: FormType, content: FormContent): QuestionSnapshot {
  const brief = (qs: ApplicationQuestion[]) => qs.map(q => ({ id: q.id, label: q.label }));
  if (type !== 'hammerhead') {
    return { sections: [{ title: null, task: false, questions: brief((content as SimpleForm).questions) }] };
  }
  const hh = content as HammerheadForm;
  return {
    sections: [
      { title: null, task: false, questions: brief([...hh.general, taskSelector(hh)]) },
      ...hh.tasks.map(t => ({ title: t.name, task: true, questions: brief(t.questions) })),
      { title: null, task: false, questions: brief(hh.final) },
    ].filter(s => s.questions.length > 0),
  };
}

export const QUESTION_ID_RE = /^[a-z0-9_]{1,40}$/;

/** A fresh id for a question added in the editor. */
export function newQuestionId(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return 'q_' + Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Rebuilds a form from known fields only, trimmed and checked. Errors name
 * the spot the way the editor labels it.
 */
export function normalizeForm(type: FormType, raw: unknown): { content?: FormContent; errors: string[] } {
  const errors: string[] = [];
  const seen = new Set<string>([TASKS_ID]);
  const types = answerTypes(type);
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

  const question = (q: any, where: string): ApplicationQuestion => {
    const id = str(q?.id);
    if (!QUESTION_ID_RE.test(id)) errors.push(`${where}: the question has no valid id.`);
    else if (seen.has(id)) errors.push(`${where}: the id "${id}" is used twice.`);
    seen.add(id);

    const label = str(q?.label);
    if (!label) errors.push(`${where}: the question needs wording.`);
    else if (label.length > FORM_LIMITS.label) errors.push(`${where}: the question is ${label.length} characters (at most ${FORM_LIMITS.label}).`);

    const qType = types.includes(q?.type) ? q.type as ApplicationQuestion['type'] : null;
    if (!qType) errors.push(`${where}: pick an answer type.`);
    const out: ApplicationQuestion = { id, label, type: qType ?? 'text', required: !!q?.required };

    const placeholder = str(q?.placeholder);
    if (placeholder.length > FORM_LIMITS.placeholder) errors.push(`${where}: the hint is ${placeholder.length} characters (at most ${FORM_LIMITS.placeholder}).`);
    if (placeholder && qType !== 'select') out.placeholder = placeholder;

    if (qType === 'select') {
      const options = (Array.isArray(q?.options) ? q.options : []).map(str).filter(Boolean);
      if (options.length < 2) errors.push(`${where}: a dropdown needs at least two choices.`);
      if (options.length > FORM_LIMITS.options) errors.push(`${where}: at most ${FORM_LIMITS.options} choices.`);
      if (new Set(options).size !== options.length) errors.push(`${where}: two choices are the same.`);
      if (options.some((o: string) => o.length > FORM_LIMITS.option)) errors.push(`${where}: a choice is longer than ${FORM_LIMITS.option} characters.`);
      out.options = options;
    } else if (qType) {
      const cap = FORM_LIMITS[qType as 'text' | 'textarea'];
      const max = Number(q?.maxLength);
      if (!Number.isInteger(max) || max < 1 || max > cap) errors.push(`${where}: the answer limit must be a whole number from 1 to ${cap}.`);
      out.maxLength = max;
    }
    return out;
  };

  const list = (raw: unknown, where: string, min: number): ApplicationQuestion[] => {
    const items = Array.isArray(raw) ? raw : [];
    if (items.length < min) errors.push(`${where}: add at least ${min === 1 ? 'one question' : `${min} questions`}.`);
    if (items.length > FORM_LIMITS.questions) errors.push(`${where}: at most ${FORM_LIMITS.questions} questions.`);
    return items.map((q, i) => question(q, `${where}, question ${i + 1}`));
  };

  let content: FormContent;
  if (type === 'hammerhead') {
    const r = raw as any;
    const general = list(r?.general, 'General questions', 1);
    const task_label = str(r?.task_label);
    if (!task_label) errors.push('Task areas: the question asking which areas needs wording.');
    else if (task_label.length > FORM_LIMITS.label) errors.push(`Task areas: that question is longer than ${FORM_LIMITS.label} characters.`);
    const tasksRaw: any[] = Array.isArray(r?.tasks) ? r.tasks : [];
    if (tasksRaw.length === 0) errors.push('Task areas: add at least one.');
    if (tasksRaw.length > FORM_LIMITS.tasks) errors.push(`Task areas: at most ${FORM_LIMITS.tasks}.`);
    const names = new Set<string>();
    const tasks = tasksRaw.map((t, i) => {
      const name = str(t?.name);
      const where = `Task area ${name ? `"${name}"` : i + 1}`;
      if (!name) errors.push(`Task area ${i + 1}: give it a name.`);
      else if (name.length > FORM_LIMITS.taskName) errors.push(`${where}: the name is longer than ${FORM_LIMITS.taskName} characters.`);
      else if (names.has(name.toLowerCase())) errors.push(`${where}: two task areas have this name.`);
      names.add(name.toLowerCase());
      return { name, questions: list(t?.questions, where, 1) };
    });
    const final = list(r?.final, 'Final questions', 0);
    content = { general, task_label, tasks, final };
  } else {
    content = { questions: list((raw as any)?.questions, 'Questions', 1) };
  }

  const locked = formQuestions(type, content).find(q => q.id === LOCKED_IDS[type]);
  const lockedHome = type === 'hammerhead' ? (content as HammerheadForm).general : (content as SimpleForm).questions;
  if (!locked || !lockedHome.includes(locked)) {
    errors.push(`The ${type === 'hammerhead' ? 'IGN and rank' : 'IGN'} question can't be removed${type === 'hammerhead' ? ' or moved out of the general questions' : ''}: the bot reads it.`);
  } else if (locked.type !== 'text' || !locked.required) {
    errors.push(`The ${type === 'hammerhead' ? 'IGN and rank' : 'IGN'} question must stay a required short answer: the bot reads it.`);
  }

  return errors.length ? { errors } : { content, errors };
}

/**
 * Checks a submission's answers against a form. Returns the answers to store
 * (known ids only, trimmed) or the first problem, worded for the applicant.
 * Hammerhead task areas count only when picked.
 */
export function checkAnswers(
  type: FormType, content: FormContent, answers: Record<string, unknown>,
): { answers: Record<string, string | string[]> } | { error: string } {
  let asked: ApplicationQuestion[];
  const out: Record<string, string | string[]> = {};
  if (type === 'hammerhead') {
    const hh = content as HammerheadForm;
    const picked = answers[TASKS_ID];
    if (!Array.isArray(picked) || picked.length === 0) return { error: 'You must select at least one task area.' };
    const byName = new Map(hh.tasks.map(t => [t.name, t]));
    for (const t of picked) {
      if (typeof t !== 'string' || !byName.has(t)) return { error: `Invalid task selection: "${String(t)}"` };
    }
    const unique = [...new Set(picked as string[])];
    out[TASKS_ID] = unique;
    asked = [...hh.general, ...unique.flatMap(t => byName.get(t)!.questions), ...hh.final];
  } else {
    asked = (content as SimpleForm).questions;
  }

  for (const q of asked) {
    const raw = answers[q.id];
    const value = typeof raw === 'string' ? raw.trim() : '';
    if (q.required && !value) return { error: `"${q.label}" is required.` };
    if (!value) continue;
    if (q.type === 'select' && !q.options?.includes(value)) return { error: `Invalid selection for "${q.label}".` };
    if (q.maxLength && (raw as string).length > q.maxLength) {
      return { error: `"${q.label}" exceeds the maximum length of ${q.maxLength} characters.` };
    }
    if (q.minLength && value.length < q.minLength) return { error: `"${q.label}" must be at least ${q.minLength} characters.` };
    out[q.id] = value;
  }
  return { answers: out };
}
