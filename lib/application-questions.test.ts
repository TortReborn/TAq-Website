import { describe, expect, it } from 'vitest';
import {
  FORM_TYPES, TASKS_ID, checkAnswers, defaultForm, formQuestions, normalizeForm, questionSnapshot,
  type HammerheadForm, type SimpleForm,
} from './application-questions';

describe('defaults', () => {
  it.each(FORM_TYPES)('the %s default passes its own validation unchanged', type => {
    const { content, errors } = normalizeForm(type, defaultForm(type));
    expect(errors).toEqual([]);
    expect(content).toEqual(defaultForm(type));
  });

  it('asks about raids without counting them', () => {
    const raid = defaultForm('hammerhead').tasks.find(t => t.name === 'Raid')!;
    expect(raid.questions[0].label).not.toMatch(/\d/);
  });

  it('hands out copies, so editing one never changes the defaults', () => {
    defaultForm('guild').questions[0].label = 'changed';
    expect(defaultForm('guild').questions[0].label).not.toBe('changed');
  });
});

describe('normalizeForm', () => {
  it('rejects removing the IGN question the bot reads', () => {
    const form = defaultForm('guild');
    form.questions = form.questions.filter(q => q.id !== 'ign');
    expect(normalizeForm('guild', form).errors.join(' ')).toMatch(/IGN question can't be removed/);
  });

  it('rejects moving the Hammerhead IGN question out of the general step', () => {
    const form = defaultForm('hammerhead');
    const ign = form.general.shift()!;
    form.final.push(ign);
    expect(normalizeForm('hammerhead', form).errors.join(' ')).toMatch(/IGN and rank/);
  });

  it('allows rewording the locked question', () => {
    const form = defaultForm('guild');
    form.questions[0].label = 'Your Minecraft username';
    expect(normalizeForm('guild', form).errors).toEqual([]);
  });

  it('rejects dropdowns on forms that cannot show them', () => {
    const form = defaultForm('community');
    form.questions.push({ id: 'q_pick', label: 'Pick', type: 'select', required: false, options: ['a', 'b'] });
    expect(normalizeForm('community', form).errors.join(' ')).toMatch(/pick an answer type/);
  });

  it('drops blank choice lines and needs two real ones', () => {
    const form = defaultForm('hammerhead');
    const q = form.tasks[3].questions[0];
    q.options = ['Yes', '', '  '];
    expect(normalizeForm('hammerhead', form).errors.join(' ')).toMatch(/at least two choices/);
    q.options = ['Yes', '', 'No '];
    expect((normalizeForm('hammerhead', form).content as HammerheadForm).tasks[3].questions[0].options).toEqual(['Yes', 'No']);
  });

  it('rejects duplicate ids, the reserved task id, and duplicate task names', () => {
    const form = defaultForm('hammerhead');
    form.final.push({ ...form.final[0] });
    form.general.push({ id: TASKS_ID, label: 'x', type: 'text', required: false, maxLength: 10 });
    form.tasks.push({ name: 'raid', questions: [{ id: 'q_x', label: 'x', type: 'text', required: false, maxLength: 10 }] });
    const errors = normalizeForm('hammerhead', form).errors.join(' ');
    expect(errors).toMatch(/"hh_dedication" is used twice/);
    expect(errors).toMatch(/"hh_tasks" is used twice/);
    expect(errors).toMatch(/two task areas have this name/);
  });

  it('caps answer limits per type', () => {
    const form = defaultForm('guild');
    form.questions[4].maxLength = 5000;
    expect(normalizeForm('guild', form).errors.join(' ')).toMatch(/from 1 to 2000/);
  });

  it('keeps only known fields', () => {
    const form = defaultForm('guild') as any;
    form.questions[1].extra = 'nope';
    form.stray = true;
    const { content } = normalizeForm('guild', form);
    expect(content).toEqual(defaultForm('guild'));
  });
});

describe('checkAnswers', () => {
  const guild = defaultForm('guild');
  const full = Object.fromEntries(guild.questions.map(q => [q.id, ` answer for ${q.id} `.slice(0, q.maxLength)]));

  it('trims, keeps known ids, and drops unknown ones', () => {
    const r = checkAnswers('guild', guild, { ...full, ign: ' Tort ', bogus: 'x' });
    expect('answers' in r && r.answers.ign).toBe('Tort');
    expect('answers' in r && 'bogus' in r.answers).toBe(false);
  });

  it('names the question a required answer is missing from', () => {
    expect(checkAnswers('guild', guild, { ...full, timezone: '  ' })).toEqual({ error: '"Timezone (in relation to GMT)" is required.' });
  });

  it('follows an edited form', () => {
    const edited: SimpleForm = { questions: [...guild.questions, { id: 'q_new', label: 'New one', type: 'text', required: true, maxLength: 5 }] };
    expect(checkAnswers('guild', edited, full)).toEqual({ error: '"New one" is required.' });
    expect(checkAnswers('guild', edited, { ...full, q_new: 'toolong' })).toEqual({ error: '"New one" exceeds the maximum length of 5 characters.' });
  });

  it('asks Hammerhead task questions only for picked areas', () => {
    const hh = defaultForm('hammerhead');
    const base = Object.fromEntries([...hh.general, ...hh.final].map(q => [q.id, 'yes']));
    const raidOnly = checkAnswers('hammerhead', hh, { ...base, [TASKS_ID]: ['Raid', 'Raid'], hh_war_importance: 'ignored' });
    expect(raidOnly).toMatchObject({ answers: { [TASKS_ID]: ['Raid'] } });
    expect('answers' in raidOnly && 'hh_war_importance' in raidOnly.answers).toBe(false);
    expect(checkAnswers('hammerhead', hh, { ...base, [TASKS_ID]: ['Wars'] })).toMatchObject({ error: expect.stringContaining('Why is participating in wars') });
    expect(checkAnswers('hammerhead', hh, { ...base, [TASKS_ID]: ['Fishing'] })).toEqual({ error: 'Invalid task selection: "Fishing"' });
    expect(checkAnswers('hammerhead', hh, { ...base, [TASKS_ID]: [] })).toEqual({ error: 'You must select at least one task area.' });
    expect(checkAnswers('hammerhead', hh, { ...base, [TASKS_ID]: ['Ing/Mat Grinding'], hh_crafting_willing: 'Maybe', hh_gbank_tracking: 'Yes' }))
      .toMatchObject({ error: expect.stringContaining('Invalid selection') });
  });
});

describe('questionSnapshot', () => {
  it('records every question of a simple form in order', () => {
    const snap = questionSnapshot('community', defaultForm('community'));
    expect(snap.sections).toHaveLength(1);
    expect(snap.sections[0].questions.map(q => q.id)).toEqual(defaultForm('community').questions.map(q => q.id));
  });

  it('marks Hammerhead task areas and covers every question', () => {
    const hh = defaultForm('hammerhead');
    const snap = questionSnapshot('hammerhead', hh);
    expect(snap.sections.filter(s => s.task).map(s => s.title)).toEqual(hh.tasks.map(t => t.name));
    expect(snap.sections.flatMap(s => s.questions.map(q => q.id))).toEqual(formQuestions('hammerhead', hh).map(q => q.id));
    expect(snap.sections[0].questions.at(-1)).toEqual({ id: TASKS_ID, label: hh.task_label });
  });
});
