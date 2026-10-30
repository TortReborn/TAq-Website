import { describe, expect, it } from 'vitest';
import { fromReadable, normalizeContent, toReadable } from './bot-panels';
import { contentValueKeys, fillValues, valuesFromReadable, valuesToReadable } from './panel-values';

describe('panel values', () => {
  it('shows {{key}} as {Label} in the editor and stores it back', () => {
    const stored = 'Rate: {{shells_per_aspect}} each, max {{max_aspects_per_conversion}}';
    const shown = 'Rate: {Shells per aspect} each, max {Max aspects per conversion}';
    expect(valuesToReadable(stored)).toBe(shown);
    expect(valuesFromReadable(shown)).toBe(stored);
    // also through the general converters, with or without a registry
    expect(toReadable(stored, null)).toBe(shown);
    expect(fromReadable(shown, null)).toBe(stored);
  });

  it('matches labels case-insensitively and leaves other braces alone', () => {
    expect(valuesFromReadable('{shells per aspect}')).toBe('{{shells_per_aspect}}');
    expect(valuesFromReadable('{not a value} and {{shells_per_aspect}}')).toBe('{not a value} and {{shells_per_aspect}}');
  });

  it('fills values for the preview and lists the keys a panel uses', () => {
    const content = { messages: [{ embeds: [{ description: '{{shells_per_aspect}} shells' }], content: 'max {{max_aspects_per_conversion}}' }] };
    expect(fillValues(content, { shells_per_aspect: '4', max_aspects_per_conversion: '25' }))
      .toEqual({ messages: [{ embeds: [{ description: '4 shells' }], content: 'max 25' }] });
    expect(contentValueKeys(content).sort()).toEqual(['max_aspects_per_conversion', 'shells_per_aspect']);
  });

  it('refuses a value that does not exist, like the bot', () => {
    expect(normalizeContent({ messages: [{ content: '{{shell_emojii}} hi' }] }).errors)
      .toEqual(["Message 1: {{shell_emojii}} isn't a value panels can use."]);
    expect(normalizeContent({ messages: [{ content: '{{shells_per_aspect}} hi' }] }).errors).toEqual([]);
  });
});
