import { describe, it, expect } from 'vitest';
import {
  CHRONICLE_PALETTE,
  allianceColorsAt,
  activeAlliancesAt,
  validateAlliancePayload,
  validateEventPayload,
  ChronicleAlliance,
} from './chronicle';

const COLOR = CHRONICLE_PALETTE[0];

const validAlliance = () => ({
  name: 'Test Pact',
  tag: 'TP',
  color: COLOR,
  description: 'A test alliance',
  memberships: [
    { guild: 'Emorians', joinedAt: '2019-01-01', leftAt: '2020-01-01' },
    { guild: 'Kingdom Foxes', joinedAt: '2019-06-01', leftAt: null },
  ],
});

const validEvent = () => ({
  eventType: 'war',
  title: 'The Great War',
  description: 'It was great',
  startsAt: '2020-03-01',
  endsAt: '2020-04-01',
  guilds: ['Emorians', 'Kingdom Foxes'],
});

describe('validateAlliancePayload', () => {
  it('accepts a valid payload and normalizes dates to ISO', () => {
    const result = validateAlliancePayload(validAlliance());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe('Test Pact');
      expect(result.value.memberships[0].joinedAt).toBe(new Date('2019-01-01').toISOString());
      expect(result.value.memberships[1].leftAt).toBeNull();
    }
  });

  it('rejects colors outside the palette', () => {
    const result = validateAlliancePayload({ ...validAlliance(), color: '#123456' });
    expect(result.ok).toBe(false);
  });

  it('rejects a leave date before the join date', () => {
    const bad = validAlliance();
    bad.memberships[0] = { guild: 'Emorians', joinedAt: '2020-01-01', leftAt: '2019-01-01' };
    expect(validateAlliancePayload(bad).ok).toBe(false);
  });

  it('rejects empty membership lists and missing names', () => {
    expect(validateAlliancePayload({ ...validAlliance(), memberships: [] }).ok).toBe(false);
    expect(validateAlliancePayload({ ...validAlliance(), name: '   ' }).ok).toBe(false);
  });

  it('rejects dates outside the sane window', () => {
    const bad = validAlliance();
    bad.memberships[0] = { guild: 'Emorians', joinedAt: '2005-01-01', leftAt: null };
    expect(validateAlliancePayload(bad).ok).toBe(false);
  });

  it('strips control characters from text fields', () => {
    const sneaky = validAlliance();
    sneaky.name = 'Evil\u0000\u001bName';
    const result = validateAlliancePayload(sneaky);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.name).toBe('EvilName');
  });
});

describe('validateEventPayload', () => {
  it('accepts a valid payload', () => {
    const result = validateEventPayload(validEvent());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.eventType).toBe('war');
  });

  it('rejects unknown event types and reversed date ranges', () => {
    expect(validateEventPayload({ ...validEvent(), eventType: 'party' }).ok).toBe(false);
    expect(validateEventPayload({ ...validEvent(), startsAt: '2020-05-01', endsAt: '2020-04-01' }).ok).toBe(false);
  });

  it('deduplicates the guild list', () => {
    const result = validateEventPayload({ ...validEvent(), guilds: ['Emorians', 'Emorians'] });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.guilds).toEqual(['Emorians']);
  });

  it('accepts alliance participants and defaults to none when omitted', () => {
    const withAlliances = validateEventPayload({ ...validEvent(), alliances: ['The Pact', 'The Pact'] });
    expect(withAlliances.ok).toBe(true);
    if (withAlliances.ok) expect(withAlliances.value.alliances).toEqual(['The Pact']);

    const without = validateEventPayload(validEvent());
    expect(without.ok).toBe(true);
    if (without.ok) expect(without.value.alliances).toEqual([]);
  });
});

describe('multi-stint memberships', () => {
  it('accepts the same guild with several join/leave intervals', () => {
    const payload = validAlliance();
    payload.memberships = [
      { guild: 'Emorians', joinedAt: '2019-01-01', leftAt: '2019-06-01' },
      { guild: 'Emorians', joinedAt: '2020-01-01', leftAt: null },
    ];
    const result = validateAlliancePayload(payload);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.memberships).toHaveLength(2);
  });
});

describe('allianceColorsAt', () => {
  const alliances: ChronicleAlliance[] = [
    {
      id: 1, name: 'Pact', tag: 'P', color: '#e53935', description: '',
      memberships: [
        { guild: 'A', joinedAt: '2019-01-01T00:00:00.000Z', leftAt: '2020-01-01T00:00:00.000Z' },
        { guild: 'B', joinedAt: '2019-06-01T00:00:00.000Z', leftAt: null },
      ],
    },
    {
      id: 2, name: 'Bloc', tag: 'B', color: '#1e88e5', description: '',
      memberships: [
        { guild: 'C', joinedAt: '2021-01-01T00:00:00.000Z', leftAt: null },
      ],
    },
  ];

  it('colors only guilds whose interval covers the timestamp', () => {
    const at2019 = allianceColorsAt(alliances, Date.parse('2019-07-01'));
    expect(at2019.get('A')).toBe('#e53935');
    expect(at2019.get('B')).toBe('#e53935');
    expect(at2019.has('C')).toBe(false);

    const at2020 = allianceColorsAt(alliances, Date.parse('2020-06-01'));
    expect(at2020.has('A')).toBe(false); // left in Jan 2020
    expect(at2020.get('B')).toBe('#e53935'); // open-ended
  });

  it('interval bounds: joined is inclusive, left is exclusive', () => {
    const atJoin = allianceColorsAt(alliances, Date.parse('2019-01-01T00:00:00.000Z'));
    expect(atJoin.get('A')).toBe('#e53935');
    const atLeave = allianceColorsAt(alliances, Date.parse('2020-01-01T00:00:00.000Z'));
    expect(atLeave.has('A')).toBe(false);
  });

  it('activeAlliancesAt returns only alliances with a current member', () => {
    expect(activeAlliancesAt(alliances, Date.parse('2019-07-01')).map(a => a.id)).toEqual([1]);
    expect(activeAlliancesAt(alliances, Date.parse('2022-01-01')).map(a => a.id)).toEqual([1, 2]);
  });
});
