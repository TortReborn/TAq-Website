#!/usr/bin/env node
/**
 * Register a private source — a citation that resolves to provenance but not to
 * a document, because the material behind it is not published and never will be.
 *
 *   node scripts/register-private-source.mjs federation-2017-discord-private \
 *     --guild "The Federation" --window "January–June 2017"
 *
 * The Chronicle standard is that every claim is sourced. Claims informed by the
 * private Discord archive still get a citation, but the archive itself is not
 * publishable, so the entry carries no url and — crucially — no document under
 * data/wiki/sources/docs/. The reference page 404s without one, so the citation
 * renders as coarse provenance and leads nowhere public. Auditable to us via the
 * vault concordance; opaque to everyone else.
 *
 * Guarded by scripts/check-private-sources.mjs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const INDEX = path.join(ROOT, 'data/wiki/sources/index.json');

const [id, ...rest] = process.argv.slice(2);
const arg = (name) => (rest.includes(name) ? rest[rest.indexOf(name) + 1] : '');
if (!id) {
  console.error('usage: node scripts/register-private-source.mjs <id> --guild "Name" --window "Jan–Jun 2017"');
  process.exit(1);
}
if (!id.endsWith('-discord-private')) {
  console.error('Private source ids must end in -discord-private, so they are obvious in the reference list.');
  process.exit(1);
}

const guild = arg('--guild');
const window = arg('--window');
if (!guild || !window) {
  console.error('--guild and --window are both required; they are the whole of what the reader gets to see.');
  process.exit(1);
}

const doc = path.join(ROOT, 'data/wiki/sources/docs', `${id}.md`);
if (fs.existsSync(doc)) {
  console.error(`${doc} exists. A private source must have no document — delete it before registering.`);
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(INDEX, 'utf8'));
data.sources[id] = {
  url: '',
  kind: 'discord-private',
  private: true,
  title: `${guild} guild Discord, ${window} (private archive, not published)`,
  tier: 'primary',
  note: 'Private archive held offline. Not published, not quoted, and not readable here: claims drawn from it are paraphrased and audited against a concordance kept with the archive.',
  registeredAt: new Date().toISOString(),
};

fs.writeFileSync(INDEX, JSON.stringify(data, null, 1) + '\n');
console.log(`Registered ${id}\n  ${data.sources[id].title}`);
