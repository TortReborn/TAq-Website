/**
 * Server side of editable application forms (TAQ-217). Table:
 * sql/create_application_forms.sql. The newest revision of a form is live;
 * a form nobody has saved yet uses the defaults in lib/application-questions.ts.
 */

import { getPool } from '@/lib/db';
import { defaultForm, type FormContent, type FormType, type HammerheadForm, type SimpleForm } from '@/lib/application-questions';

export interface FormRevisionMeta {
  rev_number: number;
  note: string;
  restored_from: number | null;
  author_name: string | null;
  created_at: string;
}

export interface LiveForm<T extends FormContent = FormContent> {
  content: T;
  /** null while the form is still on the defaults */
  rev_number: number | null;
}

export class FormConflict extends Error {
  constructor(public latestRev: number | null, public latestAuthor: string | null) {
    super('The form was changed since you opened it.');
  }
}

/** The form applicants see now. Falls back to the defaults if the table can't be read,
 *  so a database hiccup never takes the application pages down. */
export async function getLiveForm(type: 'guild' | 'community'): Promise<LiveForm<SimpleForm>>;
export async function getLiveForm(type: 'hammerhead'): Promise<LiveForm<HammerheadForm>>;
export async function getLiveForm(type: FormType): Promise<LiveForm>;
export async function getLiveForm(type: FormType): Promise<LiveForm> {
  try {
    const { rows } = await getPool().query(
      `SELECT rev_number, content FROM application_form_revisions
       WHERE form_type = $1 ORDER BY rev_number DESC LIMIT 1`,
      [type],
    );
    if (rows.length) return { content: rows[0].content, rev_number: rows[0].rev_number };
  } catch (error) {
    console.error(`Application form ${type} read error, using defaults:`, error);
  }
  return { content: defaultForm(type), rev_number: null };
}

export async function getFormRevisions(type: FormType): Promise<(FormRevisionMeta & { content: FormContent })[]> {
  const { rows } = await getPool().query(
    `SELECT rev_number, note, restored_from, author_name, created_at, content
     FROM application_form_revisions WHERE form_type = $1 ORDER BY rev_number DESC LIMIT 100`,
    [type],
  );
  return rows;
}

export interface FormSummary { form_type: FormType; rev_number: number; author_name: string | null; created_at: string }

/** The newest revision of each form that has one. */
export async function listFormSummaries(): Promise<FormSummary[]> {
  const { rows } = await getPool().query(
    `SELECT DISTINCT ON (form_type) form_type, rev_number, author_name, created_at
     FROM application_form_revisions ORDER BY form_type, rev_number DESC`,
  );
  return rows;
}

/**
 * Saves a revision on top of `baseRev` (the revision the editor opened,
 * null for the defaults). Throws FormConflict when someone saved in between.
 */
export async function saveFormRevision(type: FormType, r: {
  content: FormContent; baseRev: number | null; note: string; restoredFrom: number | null;
  authorId: string; authorName: string;
}): Promise<number> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT rev_number, author_name FROM application_form_revisions
     WHERE form_type = $1 ORDER BY rev_number DESC LIMIT 1`,
    [type],
  );
  const latest: number | null = rows[0]?.rev_number ?? null;
  if (latest !== r.baseRev) throw new FormConflict(latest, rows[0]?.author_name ?? null);
  try {
    const { rows: inserted } = await pool.query(
      `INSERT INTO application_form_revisions (form_type, rev_number, content, note, restored_from, author_id, author_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING rev_number`,
      [type, (latest ?? 0) + 1, JSON.stringify(r.content), r.note, r.restoredFrom, r.authorId, r.authorName],
    );
    return inserted[0].rev_number;
  } catch (error: any) {
    // Two saves raced for the same rev_number; the other one won.
    if (error?.code === '23505') throw new FormConflict((latest ?? 0) + 1, null);
    throw error;
  }
}
