import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Reference pages serve data/wiki/sources/docs/<id>.md verbatim, minus its
 * front matter. The stripping pattern was LF-only while most documents carry
 * CRLF, so 272 of 329 pages published their header — fetch timestamps, raw file
 * hashes, and notes written for archivists rather than readers.
 *
 * This pins the pattern against the documents as they actually are on disk.
 * Keep it in step with the regex in app/chronicle/references/[id]/page.tsx.
 */
const STRIP = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;
const DIR = path.join(process.cwd(), 'data/wiki/sources/docs');

describe('reference document front matter', () => {
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.md'));

  it('is stripped from every archived document', () => {
    const leaking = files.filter((f) => {
      const raw = fs.readFileSync(path.join(DIR, f), 'utf8');
      return raw.startsWith('---') && raw.replace(STRIP, '') === raw;
    });
    expect(leaking).toEqual([]);
  });

  it('never leaves an internal field in what a reader sees', () => {
    const bad: string[] = [];
    for (const f of files) {
      const body = fs.readFileSync(path.join(DIR, f), 'utf8').replace(STRIP, '');
      if (/^raw_sha256:|^fetched_at:|^id:\s/m.test(body.slice(0, 400))) bad.push(f);
    }
    expect(bad).toEqual([]);
  });
});
