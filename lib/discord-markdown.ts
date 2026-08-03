/**
 * Escape Discord markdown in user-provided text (IGNs, author names) before
 * sending it in message content or embed fields, so names like `_example_`
 * don't render italic. Counterpart of `discord.utils.escape_markdown` used
 * in the Tort-Reborn bot; keep the character set in sync with the bot's
 * `scripts/backfill_graid_logs.py` unescape list.
 */
export function escapeDiscordMarkdown(text: string): string {
  return text.replace(/([\\_*~`|])/g, '\\$1');
}
