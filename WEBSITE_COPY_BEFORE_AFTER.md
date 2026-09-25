# Website copy: before and after

This document contains every uncommitted copy change currently in the website repository.

## How to review

- Edit the text inside any **After (editable)** block.
- Leave an After block unchanged when you want to keep it.
- You can delete an After block and write `REVERT` if you want the original wording restored.
- Keep template expressions such as `${name}`, JSX tags, and HTML entities intact unless you want their behavior changed.
- Send this file back when you are done. I can apply the edited After blocks to the source.

## Deliberately unchanged

- The guild application questions.
- The community application questions.
- The Hammerhead application questions and answer options.

## Review inventory

- 57 files
- 184 changed text blocks

## `app/api/exec/guild-raids/route.ts`

### Change 1 (around line 232)

**Before**

```tsx
      warning: 'Queued for the bot — will appear in Discord on the next bot tick (within ~3 minutes).',
```

**After (editable)**

```tsx
      warning: 'Queued for the bot. It will appear in Discord within about 3 minutes.',
```

## `app/api/exec/promotions/bulk/route.ts`

### Change 1 (around line 35)

**Before**

```tsx
        return NextResponse.json({ error: `You cannot manage ${entry.ign} — their rank is at or above yours` }, { status: 403 });
```

**After (editable)**

```tsx
        return NextResponse.json({ error: `You cannot manage ${entry.ign} because their rank is at or above yours.` }, { status: 403 });
```

## `app/api/wiki/suggest/route.ts`

### Change 1 (around line 56)

**Before**

```tsx
    if (clash) return NextResponse.json({ error: `A page already exists at "${validated.value.slug}" — suggest an edit to it instead` }, { status: 409 });
```

**After (editable)**

```tsx
    if (clash) return NextResponse.json({ error: `A page already exists at "${validated.value.slug}". Suggest an edit to that page instead.` }, { status: 409 });
```

## `app/api/wiki/upload/route.ts`

### Change 1 (around line 57)

**Before**

```tsx
          `That file is ${formatBytes(file.size)}. The upload limit is ${formatBytes(MAX_UPLOAD_BYTES)} — ` +
```

**After (editable)**

```tsx
          `That file is ${formatBytes(file.size)}. The upload limit is ${formatBytes(MAX_UPLOAD_BYTES)}. ` +
```

### Change 2 (around line 110)

**Before**

```tsx
            'WIKI_BLOB_ACCESS — set it to "private" for a private store, or "public" for a public one.',
```

**After (editable)**

```tsx
            'WIKI_BLOB_ACCESS must be "private" for a private store or "public" for a public one.',
```

## `app/apply/page.tsx`

### Change 1 (around line 37)

**Before**

```tsx
          To apply, join our Discord server and head to the <strong style={{ color: 'var(--text-primary)' }}>#applications</strong> channel.
          Click the application button there to get started!
```

**After (editable)**

```tsx
          Join our Discord and open <strong style={{ color: 'var(--text-primary)' }}>#applications</strong> to start your application.
```

### Change 2 (around line 64)

**Before**

```tsx
          Join Our Discord
```

**After (editable)**

```tsx
          Open Discord
```

## `app/chronicle/[slug]/page.tsx`

### Change 1 (around line 32)

**Before**

```tsx
    title: `${page.title} — Chronicle`,
```

**After (editable)**

```tsx
    title: `${page.title} | Chronicle`,
```

## `app/chronicle/admin/page.tsx`

### Change 1 (around line 5)

**Before**

```tsx
  title: 'Chronicle — editorial desk',
```

**After (editable)**

```tsx
  title: 'Chronicle | Editorial desk',
```

## `app/chronicle/page.tsx`

### Change 1 (around line 14)

**Before**

```tsx
  title: 'Chronicle — The Aquarium',
```

**After (editable)**

```tsx
  title: 'Chronicle | The Aquarium',
```

### Change 2 (around line 40)

**Before**

```tsx
          The history of Wynncraft’s guild scene — its guilds, alliances, wars and eras.
```

**After (editable)**

```tsx
          The history of Wynncraft’s guilds, alliances, wars, and eras.
```

## `app/chronicle/references/[id]/page.tsx`

### Change 1 (around line 34)

**Before**

```tsx
  primary: 'Primary source — a record made at the time by the people involved.',
  retrospective: 'Retrospective account — first-person, but recalled after the events. Treat dates and motives with care, and prefer a contemporaneous record where one exists.',
  secondary: 'Secondary source — compiled or curated by others after the events, from sources of its own.',
```

**After (editable)**

```tsx
  primary: 'Primary source: a record made at the time by the people involved.',
  retrospective: 'Retrospective account: a first-person record recalled after the events. Treat dates and motives with care, and prefer a contemporary record where one exists.',
  secondary: 'Secondary source: a record compiled or curated by others after the events.',
```

### Change 2 (around line 66)

**Before**

```tsx
  return { title: `${canSeeRedacted(principal) ? title : redactText(title)} — Reference` };
```

**After (editable)**

```tsx
  return { title: `${canSeeRedacted(principal) ? title : redactText(title)} | Reference` };
```

### Change 3 (around line 152)

**Before**

```tsx
              Not a public web page — {meta.url || 'held only as this archived copy'}
```

**After (editable)**

```tsx
              Not a public web page. {meta.url || 'Held only as this archived copy.'}
```

## `app/chronicle/references/page.tsx`

### Change 1 (around line 16)

**Before**

```tsx
  title: 'References — Chronicle',
```

**After (editable)**

```tsx
  title: 'References | Chronicle',
```

## `app/chronicle/timeline/page.tsx`

### Change 1 (around line 14)

**Before**

```tsx
  title: 'Timeline — Chronicle',
```

**After (editable)**

```tsx
  title: 'Timeline | Chronicle',
```

## `app/exec/activity/trends/page.tsx`

### Change 1 (around line 45)

**Before**

```tsx
    note: 'Average number of players online at any given moment. Short ranges come from presence sampling every 3 minutes, so they are hour-by-hour and follow the timezone picker; longer ranges come from Wynncraft’s daily counter, which reaches back years but resolves only to whole UTC days.',
```

**After (editable)**

```tsx
    note: 'Average players online. Short ranges use 3-minute samples; longer ranges use daily Wynncraft data.',
```

### Change 2 (around line 53)

**Before**

```tsx
    note: 'Sampled every 3 minutes, so this is the one measure with a real hour-of-day. Covers time since sampling was switched on.',
```

**After (editable)**

```tsx
    note: 'Average players online by hour since sampling began.',
```

### Change 3 (around line 57)

**Before**

```tsx
    note: 'Wars fought by members, from the daily counter. Whole UTC days — Wynncraft’s counters cannot place activity within a day. “Territory captures” is the closest thing with real timestamps.',
```

**After (editable)**

```tsx
    note: 'Wars fought per UTC day.',
```

### Change 4 (around line 61)

**Before**

```tsx
    note: 'Raids completed, counted per person — a 4-player raid counts 4. From the bot’s daily counter, so whole UTC days; “Guild raids” covers the same activity with exact times.',
```

**After (editable)**

```tsx
    note: 'Raids completed per player and UTC day.',
```

### Change 5 (around line 65)

**Before**

```tsx
    note: 'Territories taken by TAq, timestamped to the second. Captures only — losing land is a different question.',
```

**After (editable)**

```tsx
    note: 'TAq territory captures.',
```

### Change 6 (around line 69)

**Before**

```tsx
    note: 'Logged guild raids, weighted by party size — a 4-player raid counts 4, a solo clear counts 1. Average party is about 3.4, and 13% of raids are solo, so counting raids as events would understate group activity. Hover a point for the raw raid count.',
```

**After (editable)**

```tsx
    note: 'Guild raids weighted by party size. Hover for the raid count.',
```

### Change 7 (around line 73)

**Before**

```tsx
    note: 'Logged snipe attempts against enemy HQs, timestamped.',
```

**After (editable)**

```tsx
    note: 'Logged attacks on enemy HQs.',
```

### Change 8 (around line 344)

**Before**

```tsx
              ? 'This member’s own history.'
              : 'Only members whose Discord account is linked at this rank — former '
                + 'members keep their history but hold no rank, so cohorts will not sum '
                + 'to the guild total.'}
            {' '}Territory captures, guild raids and snipes are guild-wide and have no such
            breakdown, so they are not shown here. Playtime and wars come from
            Wynncraft&apos;s daily counter and are complete; anyone who hides their online
            status is missing from the hour-by-hour view, because Wynncraft will not say
            {' '}<em>which</em> members are online.
```

**After (editable)**

```tsx
              ? 'Member activity.'
              : 'Activity for linked members in this group. Former members are excluded.'}
            {' '}Guild-wide metrics are hidden. Hourly data excludes hidden online status.
```

### Change 9 (around line 402)

**Before**

```tsx
          How much the guild is playing, and when — for spotting trends and finding the hours
          we actually have people online.
```

**After (editable)**

```tsx
          Guild activity by date and time.
```

### Change 10 (around line 508)

**Before**

```tsx
          ? 'Hours this member played, from Wynncraft’s daily counter. Whole UTC days, '
            + 'so the timezone picker does not apply.'
```

**After (editable)**

```tsx
          ? 'Hours played per UTC day.'
```

### Change 11 (around line 512)

**Before**

```tsx
          <> Over this range a day is the finest grain available, so buckets are whole
            UTC days and the timezone picker does not apply.</>
```

**After (editable)**

```tsx
          <> Shown by UTC day.</>
```

### Change 12 (around line 515)

**Before**

```tsx
          <> Served from presence sampling here, so these are real hours in {tz}.</>
```

**After (editable)**

```tsx
          <> Shown by hour in {tz}.</>
```

### Change 13 (around line 520)

**Before**

```tsx
          <> About {Math.round((1 - charted.data.attributedShare) * 100)}% of online members hide
            their status — counted in this total, but absent from any per-member breakdown.</>
```

**After (editable)**

```tsx
          <> {Math.round((1 - charted.data.attributedShare) * 100)}% cannot be assigned to members due to hidden status.</>
```

### Change 14 (around line 559)

**Before**

```tsx
          <> Showing 7 days here — one day gives each slot a single occurrence,
            which is too little to average.</>
```

**After (editable)**

```tsx
          <> Uses 7 days for hourly averages.</>
```

### Change 15 (around line 595)

**Before**

```tsx
            <strong style={{ color: 'var(--text-primary)' }}>Two different clocks.</strong>{' '}
            Playtime, wars and raid clears come from a snapshot taken once a day at 00:01 UTC, so
            they are whole UTC days with no time-of-day and the timezone picker does not apply to
            them. Captures, guild raids, snipes and members-online carry real timestamps and do
            follow the picker.
```

**After (editable)**

```tsx
            <strong style={{ color: 'var(--text-primary)' }}>Daily data.</strong>{' '}
            Playtime, wars and raid clears use UTC-day snapshots. Other metrics use timestamps
            and follow the timezone picker.
```

### Change 16 (around line 600)

**Before**

```tsx
            <strong style={{ color: 'var(--text-primary)' }}>Gaps are drawn as gaps.</strong>{' '}
            Members-online is sampled every 3 minutes; hatched bands mark spans where the sampler
            was not running. Those are missing data, not quiet hours.
```

**After (editable)**

```tsx
            <strong style={{ color: 'var(--text-primary)' }}>Missing samples.</strong>{' '}
            Hatched spans contain no data.
```

### Change 17 (around line 604)

**Before**

```tsx
            <strong style={{ color: 'var(--text-primary)' }}>Hidden members are counted, but not named.</strong>{' '}
            Wynncraft lets players hide their online status. They are included in the guild-wide
            online count, but cannot be attributed to a specific member, so any per-member
            breakdown omits them.
```

**After (editable)**

```tsx
            <strong style={{ color: 'var(--text-primary)' }}>Hidden status.</strong>{' '}
            Guild totals include hidden players; member views cannot.
```

### Change 18 (around line 608)

**Before**

```tsx
            <strong style={{ color: 'var(--text-primary)' }}>Some days are adjusted.</strong>{' '}
            Where a snapshot was missed, a day&apos;s value is spread evenly across the gap. Where
            the counter moved backwards or implied more than 24 hours in a day, it was clamped.
            Switch any chart to its table view to see what share of each bucket was adjusted.
```

**After (editable)**

```tsx
            <strong style={{ color: 'var(--text-primary)' }}>Adjusted days.</strong>{' '}
            Missed or invalid snapshots are normalized. Table view shows adjusted shares.
```

## `app/exec/chronicle/page.tsx`

### Change 1 (around line 164)

**Before**

```tsx
      alert('Network error — please try again');
```

**After (editable)**

```tsx
      alert('Could not reach the server. Try again.');
```

### Change 2 (around line 216)

**Before**

```tsx
        Chronicle Wiki — suggestion queue
```

**After (editable)**

```tsx
        Chronicle Wiki: suggestion queue
```

### Change 3 (around line 231)

**Before**

```tsx
        Direct edits publish immediately — no review step. They still appear in the decision log.
```

**After (editable)**

```tsx
        Direct edits publish immediately without review. They still appear in the decision log.
```

## `app/exec/guild-raids/GraidLogBrowse.tsx`

### Change 1 (around line 124)

**Before**

```tsx
          <div style={{ padding: '1.5rem', textAlign: 'center', color: '#ef4444', fontSize: '0.85rem' }}>Failed to load logs</div>
```

**After (editable)**

```tsx
          <div style={{ padding: '1.5rem', textAlign: 'center', color: '#ef4444', fontSize: '0.85rem' }}>Could not load guild raid logs.</div>
```

### Change 2 (around line 126)

**Before**

```tsx
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>No graid logs found.</div>
```

**After (editable)**

```tsx
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>No guild raid logs match these filters.</div>
```

## `app/exec/guild-raids/GraidLogDashboard.tsx`

### Change 1 (around line 63)

**Before**

```tsx
  if (error) return <div style={{ ...cardStyle, textAlign: 'center', color: '#ef4444' }}>Failed to load dashboard</div>;
  if (!data) return <div style={{ ...cardStyle, textAlign: 'center', color: 'var(--text-secondary)' }}>No data available</div>;
```

**After (editable)**

```tsx
  if (error) return <div style={{ ...cardStyle, textAlign: 'center', color: '#ef4444' }}>Could not load guild raid stats.</div>;
  if (!data) return <div style={{ ...cardStyle, textAlign: 'center', color: 'var(--text-secondary)' }}>No guild raid data yet.</div>;
```

### Change 2 (around line 125)

**Before**

```tsx
                  ? `${selectedEvent.title} — Per-Day Distribution`
```

**After (editable)**

```tsx
                  ? `${selectedEvent.title}: Per-Day Distribution`
```

## `app/exec/guild-raids/GraidLogForm.tsx`

### Change 1 (around line 122)

**Before**

```tsx
        ? `Queued ${n} raid${n === 1 ? '' : 's'} — the bot will post them to Discord on its next tick (within ~3 min).`
        : `Queued ${n} raid${n === 1 ? '' : 's'} silently — added to totals on the next bot tick (within ~3 min), not posted to Discord.`;
```

**After (editable)**

```tsx
        ? `Queued ${n} raid${n === 1 ? '' : 's'}. The bot will post ${n === 1 ? 'it' : 'them'} to Discord within about 3 minutes.`
        : `Queued ${n} raid${n === 1 ? '' : 's'} silently. ${n === 1 ? 'It' : 'They'} will count toward totals within about 3 minutes without a Discord post.`;
```

### Change 2 (around line 127)

**Before**

```tsx
          ? `${base} Note: ${unlinked.join(', ')} ${unlinked.length === 1 ? 'is' : 'are'} not linked to Discord yet — the raid still counts, but double-check the spelling.`
```

**After (editable)**

```tsx
          ? `${base} Note: ${unlinked.join(', ')} ${unlinked.length === 1 ? 'is' : 'are'} not linked to Discord yet. The raid still counts; check the spelling.`
```

### Change 3 (around line 184)

**Before**

```tsx
              Unknown raids are added to player totals but never posted to Discord — use for fixing missing/desynced raids.
```

**After (editable)**

```tsx
              Unknown raids count toward player totals but are not posted to Discord. Use this to fix missing or desynced raids.
```

## `app/exec/guild-raids/GraidLogLeaderboard.tsx`

### Change 1 (around line 61)

**Before**

```tsx
          <div style={{ padding: '1.5rem', textAlign: 'center', color: '#ef4444', fontSize: '0.85rem' }}>Failed to load leaderboard</div>
```

**After (editable)**

```tsx
          <div style={{ padding: '1.5rem', textAlign: 'center', color: '#ef4444', fontSize: '0.85rem' }}>Could not load the guild raid leaderboard.</div>
```

### Change 2 (around line 63)

**Before**

```tsx
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>No data available.</div>
```

**After (editable)**

```tsx
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>No guild raid records yet.</div>
```

## `app/exec/guild-raids/PlayerRaceChart.tsx`

### Change 1 (around line 642)

**Before**

```tsx
                title={`${QUALITY_PRESETS[q].label} — ${Math.round(CANVAS_W * QUALITY_PRESETS[q].scale)}×${Math.round(CANVAS_H * QUALITY_PRESETS[q].scale)} @ ${QUALITY_PRESETS[q].fps}fps, ${(QUALITY_PRESETS[q].bitrate / 1_000_000).toFixed(1)} Mbps`}
```

**After (editable)**

```tsx
                title={`${QUALITY_PRESETS[q].label}: ${Math.round(CANVAS_W * QUALITY_PRESETS[q].scale)}×${Math.round(CANVAS_H * QUALITY_PRESETS[q].scale)} @ ${QUALITY_PRESETS[q].fps}fps, ${(QUALITY_PRESETS[q].bitrate / 1_000_000).toFixed(1)} Mbps`}
```

## `app/exec/inventory/WoealerPanel.tsx`

### Change 1 (around line 792)

**Before**

```tsx
                  placeholder="What is stored here — list item names so search can find them."
```

**After (editable)**

```tsx
                  placeholder="List the stored item names so search can find them."
```

## `app/exec/shell-exchange/page.tsx`

### Change 1 (around line 158)

**Before**

```tsx
  if (loading) return <div style={{ color: 'var(--text-secondary)', padding: '2rem' }}>Loading...</div>;
```

**After (editable)**

```tsx
  if (loading) return <div style={{ color: 'var(--text-secondary)', padding: '2rem' }}>Loading shell exchange...</div>;
```

## `app/exec/snipes/Builds.tsx`

### Change 1 (around line 727)

**Before**

```tsx
                                ? `Outdated — latest is v${formatVersion(latest)}`
```

**After (editable)**

```tsx
                                ? `Outdated. Latest is v${formatVersion(latest)}`
```

### Change 2 (around line 770)

**Before**

```tsx
                                      title={`Undo — revert to v${formatVersion(prevRef)}`}
```

**After (editable)**

```tsx
                                      title={`Undo and revert to v${formatVersion(prevRef)}`}
```

### Change 3 (around line 931)

**Before**

```tsx
                                  title={def.archived ? `${def.name} — build archived` : `${def.name} v${formatVersion(ref)} — version archived`}
```

**After (editable)**

```tsx
                                  title={def.archived ? `${def.name}: build archived` : `${def.name} v${formatVersion(ref)}: version archived`}
```

### Change 4 (around line 968)

**Before**

```tsx
                                    aria-label={`Remove ${def.name} from ${member.ign} — erases the record that they had it`}
```

**After (editable)**

```tsx
                                    aria-label={`Remove ${def.name} from ${member.ign} and erase their assignment record`}
```

### Change 5 (around line 980)

**Before**

```tsx
                                    title={`Remove — erases the record that ${member.ign} had ${def.name}`}
```

**After (editable)**

```tsx
                                    title={`Remove and erase ${member.ign}'s ${def.name} assignment record`}
```

### Change 6 (around line 1139)

**Before**

```tsx
                              This will remove this build (all versions) from all members and erase who had it — unlike Archive, this cannot be undone.
```

**After (editable)**

```tsx
                              This removes every version and member assignment. Unlike Archive, it cannot be undone.
```

### Change 7 (around line 1178)

**Before**

```tsx
                                  title="Archive — members keep the assignment but stop getting the role"
```

**After (editable)**

```tsx
                                  title="Archive. Members keep the assignment but stop getting the role."
```

### Change 8 (around line 1253)

**Before**

```tsx
                                  title={`Archive v${formatVersion(latestVersion)} — members on it lose the role until upgraded; the next active version becomes latest`}
```

**After (editable)**

```tsx
                                  title={`Archive v${formatVersion(latestVersion)}. Members on it lose the role until upgraded; the next active version becomes latest.`}
```

### Change 9 (around line 1394)

**Before**

```tsx
                                          title={v.archived ? 'Restore this version' : 'Archive — members on it lose the role until upgraded'}
```

**After (editable)**

```tsx
                                          title={v.archived ? 'Restore this version' : 'Archive. Members on it lose the role until upgraded.'}
```

### Change 10 (around line 1438)

**Before**

```tsx
                        This removes the build, all versions, and every member&apos;s assignment record — unlike Archive, this cannot be undone.
```

**After (editable)**

```tsx
                        This removes the build, all versions, and every member&apos;s assignment record. Unlike Archive, this cannot be undone.
```

### Change 11 (around line 1467)

**Before**

```tsx
                            title="Restore — the build becomes assignable again and roles come back on the next sync"
```

**After (editable)**

```tsx
                            title="Restore. The build becomes assignable again, and roles return on the next sync."
```

## `app/exec/snipes/SnipeLeaderboard.tsx`

### Change 1 (around line 63)

**Before**

```tsx
          <div style={{ padding: '1.5rem', textAlign: 'center', color: '#ef4444', fontSize: '0.85rem' }}>Failed to load leaderboard</div>
```

**After (editable)**

```tsx
          <div style={{ padding: '1.5rem', textAlign: 'center', color: '#ef4444', fontSize: '0.85rem' }}>Could not load the snipe leaderboard.</div>
```

### Change 2 (around line 65)

**Before**

```tsx
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>No data available.</div>
```

**After (editable)**

```tsx
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>No snipe records yet.</div>
```

## `app/graid-event/page.tsx`

### Change 1 (around line 125)

**Before**

```tsx
              There is no ongoing event, check the latest one below
```

**After (editable)**

```tsx
              No event is active. The latest event is shown below.
```

### Change 2 (around line 251)

**Before**

```tsx
                No Event Data
```

**After (editable)**

```tsx
                No event to show
```

### Change 3 (around line 253)

**Before**

```tsx
              <p style={{ color: 'var(--text-muted)', margin: 0, textAlign: 'center' }}>No event data found in the database.</p>
```

**After (editable)**

```tsx
              <p style={{ color: 'var(--text-muted)', margin: 0, textAlign: 'center' }}>There are no guild raid events yet.</p>
```

## `app/layout.tsx`

### Change 1 (around line 220)

**Before**

```tsx
        <meta name="description" content="The Aquarium - Wynncraft guild territory map, leaderboards, and member statistics" />
```

**After (editable)**

```tsx
        <meta name="description" content="The Aquarium's Wynncraft guild map, leaderboards, member profiles, and raid tools." />
```

### Change 2 (around line 224)

**Before**

```tsx
        <meta property="og:description" content="Wynncraft guild territory map, leaderboards, and member statistics" />
```

**After (editable)**

```tsx
        <meta property="og:description" content="The Aquarium's Wynncraft guild map, leaderboards, member profiles, and raid tools." />
```

### Change 3 (around line 233)

**Before**

```tsx
        <meta name="twitter:description" content="Wynncraft guild territory map and statistics" />
```

**After (editable)**

```tsx
        <meta name="twitter:description" content="The Aquarium's Wynncraft guild map, leaderboards, member profiles, and raid tools." />
```

### Change 4 (around line 252)

**Before**

```tsx
              "description": "Wynncraft guild territory tracking and statistics",
```

**After (editable)**

```tsx
              "description": "Wynncraft guild tools for maps, rankings, raids, and member stats",
```

### Change 5 (around line 602)

**Before**

```tsx
                aria-label="Hammerhead Application — requires Angler rank"
```

**After (editable)**

```tsx
                aria-label="Hammerhead application, Angler rank required"
```

### Change 6 (around line 679)

**Before**

```tsx
              Login
```

**After (editable)**

```tsx
              Sign in
```

### Change 7 (around line 1089)

**Before**

```tsx
                aria-label="Hammerhead Application — requires Angler rank"
```

**After (editable)**

```tsx
                aria-label="Hammerhead application, Angler rank required"
```

### Change 8 (around line 1149)

**Before**

```tsx
              >Login</NavLink>
```

**After (editable)**

```tsx
              >Sign in</NavLink>
```

## `app/login/page.tsx`

### Change 1 (around line 22)

**Before**

```tsx
    denied: 'You cancelled the Discord authorization.',
    missing_params: 'Invalid callback parameters. Please try again.',
    invalid_state: 'Session expired. Please try again.',
    auth_failed: 'Authentication failed. Please try again.',
    config: 'Server configuration error. Contact an admin.',
```

**After (editable)**

```tsx
    denied: 'Discord sign-in was cancelled.',
    missing_params: 'Discord did not return the required sign-in details. Try again.',
    invalid_state: 'This sign-in link expired. Start again.',
    auth_failed: 'Discord sign-in failed. Try again.',
    config: 'Sign-in is unavailable. Contact an admin.',
```

### Change 2 (around line 113)

**Before**

```tsx
            {errorMessages[error] || 'An unknown error occurred.'}
```

**After (editable)**

```tsx
            {errorMessages[error] || 'We could not sign you in. Try again.'}
```

### Change 3 (around line 161)

**Before**

```tsx
        <div style={{ color: 'var(--text-secondary)' }}>Loading...</div>
```

**After (editable)**

```tsx
        <div style={{ color: 'var(--text-secondary)' }}>Checking your session...</div>
```

## `app/map/page.tsx`

### Change 1 (around line 2665)

**Before**

```tsx
              title="Chronicle — alliances & events"
```

**After (editable)**

```tsx
              title="Chronicle: alliances and events"
```

## `app/page.tsx`

### Change 1 (around line 84)

**Before**

```tsx
              Dive into Wynncraft's most established aquatic guild! Whether it's sniping HQs,
              wiping claims, completing guild raids, participating in events, or just hanging
              out with an active, welcoming and stress-free community, there's a place for
              you here.
```

**After (editable)**

```tsx
              The Fish Tank themed Guild for wars, guild raids, events and a &quot;Community Home&quot;
```

### Change 2 (around line 92)

**Before**

```tsx
              Join Our Discord
```

**After (editable)**

```tsx
              Join Discord
```

### Change 3 (around line 111)

**Before**

```tsx
          <h2 className="home-section-title">Our Numbers</h2>
```

**After (editable)**

```tsx
          <h2 className="home-section-title">Guild Stats</h2>
```

### Change 4 (around line 128)

**Before**

```tsx
              <span className="home-stat-label">Guild Raids Done</span>
```

**After (editable)**

```tsx
              <span className="home-stat-label">Guild Raids</span>
```

### Change 5 (around line 160)

**Before**

```tsx
          <h2 className="home-section-title">What We Offer</h2>
```

**After (editable)**

```tsx
          <h2 className="home-section-title">Inside TAq</h2>
```

### Change 6 (around line 172)

**Before**

```tsx
              <h3>Advanced Ecosystem</h3>
              <p>A big, established ecosystem including this website and our very own
                bot Tort plus regular events with huge payouts and contribution that's
                rewarded properly and many statistics that our members can easily access.
              </p>
```

**After (editable)**

```tsx
              <h3>Guild Tools</h3>
              <p>This website, our Discord Bot Tort and our own guild mod provide a lot of utility for you and come together in a big ecosystem.</p>
```

### Change 7 (around line 186)

**Before**

```tsx
              <p>A dedicated core of warriors and raiders, ready to help you deep dive into
                either area, with a big forum for optimal raid builds and guides for them,
                as well as cutting edge war tech and builds.
              </p>
```

**After (editable)**

```tsx
              <p>Join regular war and raid parties, find builds, comprehensive guides and learn from experienced players.</p>
```

### Change 8 (around line 199)

**Before**

```tsx
              <p>150 members, stable leadership, a welcoming community, and an easy way
                for you to find new friends.
              </p>
```

**After (editable)**

```tsx
              <p>Meet new people and chat around, participate in regular events, or just play along while the guild chat plays like a podcast.</p>
```

### Change 9 (around line 208)

**Before**

```tsx
          <h2 className="home-section-title">Explore</h2>
```

**After (editable)**

```tsx
          <h2 className="home-section-title">Guild Tools</h2>
```

### Change 10 (around line 213)

**Before**

```tsx
                <span className="home-link-desc">Various views of the Wynncraft map</span>
```

**After (editable)**

```tsx
                <span className="home-link-desc">View live territory, history, and custom map layers</span>
```

### Change 11 (around line 220)

**Before**

```tsx
                <span className="home-link-desc">Browse our roster and member profiles</span>
```

**After (editable)**

```tsx
                <span className="home-link-desc">Browse the roster and member profiles</span>
```

### Change 12 (around line 227)

**Before**

```tsx
                <span className="home-link-desc">See our top contributors ranked</span>
```

**After (editable)**

```tsx
                <span className="home-link-desc">Rank members by contribution</span>
```

### Change 13 (around line 234)

**Before**

```tsx
                <span className="home-link-desc">Track ongoing and previous graid events</span>
```

**After (editable)**

```tsx
                <span className="home-link-desc">Follow current and past graid events</span>
```

### Change 14 (around line 241)

**Before**

```tsx
                <span className="home-link-desc">View raid loot distributions and drops</span>
```

**After (editable)**

```tsx
                <span className="home-link-desc">Check weekly lootrun and raid rotations</span>
```

### Change 15 (around line 252)

**Before**

```tsx
          <h2 className="home-cta-title">Ready to Dive In?</h2>
          <p className="home-cta-text">Join our Discord and become part of the crew.</p>
```

**After (editable)**

```tsx
          <h2 className="home-cta-title">Want to join TAq?</h2>
          <p className="home-cta-text">Apply through our Discord.</p>
```

### Change 16 (around line 260)

**Before**

```tsx
            Apply Now
```

**After (editable)**

```tsx
            Open Discord
```

## `app/profile/page.tsx`

### Change 1 (around line 291)

**Before**

```tsx
        <p style={{ color: '#ef4444' }}>Failed to load profile data. Please try again later.</p>
```

**After (editable)**

```tsx
        <p style={{ color: '#ef4444' }}>We could not load your profile. Refresh the page to try again.</p>
```

### Change 2 (around line 434)

**Before**

```tsx
                    <td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</td>
```

**After (editable)**

```tsx
                    <td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Loading activity...</td>
```

### Change 3 (around line 466)

**Before**

```tsx
                  ? 'New member — exempt from kick requirements'
```

**After (editable)**

```tsx
                  ? 'New member, exempt from kick requirements'
```

### Change 4 (around line 489)

**Before**

```tsx
                      kickStatus.kickListTier === 1 ? ' — Kick First'
                      : kickStatus.kickListTier === 2 ? ' — If Needed'
                      : ' — Last Resort'
```

**After (editable)**

```tsx
                      kickStatus.kickListTier === 1 ? ': Kick First'
                      : kickStatus.kickListTier === 2 ? ': If Needed'
                      : ': Last Resort'
```

### Change 5 (around line 823)

**Before**

```tsx
                Loading...
```

**After (editable)**

```tsx
                Loading profile...
```

## `app/unauthorized/page.tsx`

### Change 1 (around line 27)

**Before**

```tsx
      You are signed in, though — the{' '}
```

**After (editable)**

```tsx
      You are signed in. The{' '}
```

## `components/ApplicationForm.tsx`

### Change 1 (around line 77)

**Before**

```tsx
      return 'This field is required.';
```

**After (editable)**

```tsx
      return 'Enter an answer.';
```

### Change 2 (around line 181)

**Before**

```tsx
        errors['ign'] = 'Please wait for IGN verification to complete.';
```

**After (editable)**

```tsx
        errors['ign'] = 'Wait for username verification to finish.';
```

### Change 3 (around line 183)

**Before**

```tsx
        errors['ign'] = errors['ign'] || 'This player was not found. Please check your IGN.';
```

**After (editable)**

```tsx
        errors['ign'] = errors['ign'] || 'Player not found. Check the username.';
```

### Change 4 (around line 218)

**Before**

```tsx
        setSubmitError(data.error || 'Something went wrong. Please try again.');
```

**After (editable)**

```tsx
        setSubmitError(data.error || 'We could not send the application. Try again.');
```

### Change 5 (around line 222)

**Before**

```tsx
      setSubmitError('Network error. Please check your connection and try again.');
```

**After (editable)**

```tsx
      setSubmitError('We could not reach the server. Check your connection and try again.');
```

### Change 6 (around line 271)

**Before**

```tsx
            Invalid or Expired Link
```

**After (editable)**

```tsx
            Application link expired
```

### Change 7 (around line 279)

**Before**

```tsx
            This application link is no longer valid. Please go to the <strong>#applications</strong> channel
            in our Discord server and click the application button to get a new link.
```

**After (editable)**

```tsx
            Open <strong>#applications</strong> in our Discord and use the application button to get a new link.
```

### Change 8 (around line 327)

**Before**

```tsx
            Application Submitted!
```

**After (editable)**

```tsx
            Application sent
```

### Change 9 (around line 334)

**Before**

```tsx
            We've received your {applicationType === 'guild' ? 'guild member' : 'community member'} application.
            We'll review it and get back to you soon in Discord.
```

**After (editable)**

```tsx
            Your {applicationType === 'guild' ? 'guild member' : 'community member'} application is with the exec team.
            We will reply in Discord.
```

### Change 10 (around line 579)

**Before**

```tsx
                    View stats page — please ensure it is public
```

**After (editable)**

```tsx
                    View stats page (make sure it is public)
```

### Change 11 (around line 619)

**Before**

```tsx
          {formState === 'submitting' ? 'Submitting...' : 'Submit Application'}
```

**After (editable)**

```tsx
          {formState === 'submitting' ? 'Sending...' : 'Send application'}
```

## `components/BottomBar.tsx`

### Change 1 (around line 51)

**Before**

```tsx
            Wynncraft's premier aquatic-themed guild
```

**After (editable)**

```tsx
            A Wynncraft guild
```

### Change 2 (around line 195)

**Before**

```tsx
}
```

**After (editable)**

```tsx
}
```

## `components/ChroniclePanel.tsx`

### Change 1 (around line 263)

**Before**

```tsx
      setError('Network error — please try again');
```

**After (editable)**

```tsx
      setError('Could not reach the server. Try again.');
```

### Change 2 (around line 279)

**Before**

```tsx
            : 'An admin will approve or reject it — approved entries appear on the map.'}
```

**After (editable)**

```tsx
            : 'An admin will approve or reject it. Approved entries appear on the map.'}
```

## `components/ChroniclerManager.tsx`

### Change 1 (around line 114)

**Before**

```tsx
        without review and decide on those suggestions — no guild rank or membership needed, just
```

**After (editable)**

```tsx
        without review and decide on those suggestions. No guild rank or membership is required, only
```

### Change 2 (around line 146)

**Before**

```tsx
            ? ' Add one above — you will need their Discord user ID (Developer Mode → right-click → Copy User ID).'
```

**After (editable)**

```tsx
            ? ' Add one above. You will need their Discord user ID (Developer Mode → right-click → Copy User ID).'
```

### Change 3 (around line 225)

**Before**

```tsx
                          title="Revoke — past edits and vouches stay attributed"
```

**After (editable)**

```tsx
                          title="Revoke. Past edits and vouches stay attributed."
```

## `components/ChroniclesAdmin.tsx`

### Change 1 (around line 138)

**Before**

```tsx
          : <>You are reading this as a visitor — anyone can see what needs doing; acting on it needs a chronicler role.</>}
```

**After (editable)**

```tsx
          : <>You are reading this as a visitor. Anyone can see the work queue; a chronicler role is required to act on it.</>}
```

### Change 2 (around line 164)

**Before**

```tsx
            {stats.revisions.toLocaleString()} revisions in all — {stats.humanRevisions.toLocaleString()} written
```

**After (editable)**

```tsx
            {stats.revisions.toLocaleString()} revisions total: {stats.humanRevisions.toLocaleString()} written
```

### Change 3 (around line 213)

**Before**

```tsx
                Nothing outstanding — every published page has been read by a person.
```

**After (editable)**

```tsx
                Nothing outstanding. Every published page has been read by a person.
```

## `components/ConflictFinder.tsx`

### Change 1 (around line 895)

**Before**

```tsx
          <div>{formatDateTime(conflict.startTime)} — {formatDateTime(conflict.endTime)}</div>
```

**After (editable)**

```tsx
          <div>{formatDateTime(conflict.startTime)} – {formatDateTime(conflict.endTime)}</div>
```

## `components/ExecActivityTable.tsx`

### Change 1 (around line 441)

**Before**

```tsx
          No members found.
```

**After (editable)**

```tsx
          No members match this view.
```

## `components/FactionPanel.tsx`

### Change 1 (around line 552)

**Before**

```tsx
                  No guilds found.
```

**After (editable)**

```tsx
                  No guilds match your search.
```

## `components/HammerheadApplicationCard.tsx`

### Change 1 (around line 250)

**Before**

```tsx
                  — {selectedTasks.join(', ')}
```

**After (editable)**

```tsx
                  : {selectedTasks.join(', ')}
```

## `components/HammerheadApplicationForm.tsx`

### Change 1 (around line 94)

**Before**

```tsx
        return 'Please select at least one option.';
```

**After (editable)**

```tsx
        return 'Choose at least one option.';
```

### Change 2 (around line 102)

**Before**

```tsx
        return 'Please select an option.';
```

**After (editable)**

```tsx
        return 'Choose an option.';
```

### Change 3 (around line 114)

**Before**

```tsx
      return 'This field is required.';
```

**After (editable)**

```tsx
      return 'Enter an answer.';
```

### Change 4 (around line 227)

**Before**

```tsx
        setSubmitError(data.error || 'Something went wrong. Please try again.');
```

**After (editable)**

```tsx
        setSubmitError(data.error || 'We could not send the application. Try again.');
```

### Change 5 (around line 231)

**Before**

```tsx
      setSubmitError('Network error. Please check your connection and try again.');
```

**After (editable)**

```tsx
      setSubmitError('We could not reach the server. Check your connection and try again.');
```

### Change 6 (around line 393)

**Before**

```tsx
            Login Required
```

**After (editable)**

```tsx
            Sign in required
```

### Change 7 (around line 396)

**Before**

```tsx
            You need to be logged in to submit a Hammerhead application.
            Please log in with your Discord account.
```

**After (editable)**

```tsx
            Sign in with Discord to send a Hammerhead application.
```

### Change 8 (around line 411)

**Before**

```tsx
            Log In
```

**After (editable)**

```tsx
            Sign in with Discord
```

### Change 9 (around line 430)

**Before**

```tsx
            Insufficient Rank
```

**After (editable)**

```tsx
            Angler rank required
```

### Change 10 (around line 433)

**Before**

```tsx
            You must be <strong>Angler</strong> or <strong>Swordfish</strong> rank to apply for Hammerhead.
```

**After (editable)**

```tsx
            Hammerhead applications are open to <strong>Angler</strong> and <strong>Swordfish</strong> members.
```

### Change 11 (around line 453)

**Before**

```tsx
            Already Exec
```

**After (editable)**

```tsx
            No application needed
```

### Change 12 (around line 456)

**Before**

```tsx
            You are already <strong>{user?.rank}</strong> rank and do not need to apply for Hammerhead.
```

**After (editable)**

```tsx
            Your <strong>{user?.rank}</strong> rank already includes exec access.
```

### Change 13 (around line 475)

**Before**

```tsx
            Application Submitted!
```

**After (editable)**

```tsx
            Application sent
```

### Change 14 (around line 478)

**Before**

```tsx
            Your Hammerhead application has been received and will be reviewed by the exec team.
            We'll get back to you soon.
```

**After (editable)**

```tsx
            The exec team will review it and reply in Discord.
```

### Change 15 (around line 613)

**Before**

```tsx
            Preview mode — you can browse the form but submission is disabled.
```

**After (editable)**

```tsx
            Preview mode. You can read the form, but you cannot send it.
```

### Change 16 (around line 815)

**Before**

```tsx
              {isPreviewMode ? 'Submission Disabled (Preview)' : formState === 'submitting' ? 'Submitting...' : 'Submit Application'}
```

**After (editable)**

```tsx
              {isPreviewMode ? 'Preview only' : formState === 'submitting' ? 'Sending...' : 'Send application'}
```

## `components/HistoryTimeline.tsx`

### Change 1 (around line 487)

**Before**

```tsx
    <span style={{ color: WARNING_COLOR }}>Wars were down — nothing changed</span>
```

**After (editable)**

```tsx
    <span style={{ color: WARNING_COLOR }}>Wars were down. Nothing changed.</span>
```

### Change 2 (around line 489)

**Before**

```tsx
    <span style={{ color: WARNING_COLOR }}>Logging gap — data missing</span>
```

**After (editable)**

```tsx
    <span style={{ color: WARNING_COLOR }}>Logging gap. Data is missing.</span>
```

### Change 3 (around line 849)

**Before**

```tsx
        title={`Zoomed to ${seasonZoom.label === 'Off' ? 'off-season' : seasonZoom.label} — back to full range`}
```

**After (editable)**

```tsx
        title={`Zoomed to ${seasonZoom.label === 'Off' ? 'off-season' : seasonZoom.label}. Return to full range.`}
```

## `components/KickListPanel.tsx`

### Change 1 (around line 221)

**Before**

```tsx
          Loading...
```

**After (editable)**

```tsx
          Loading kick list...
```

## `components/MapHistoryControls.tsx`

### Change 1 (around line 743)

**Before**

```tsx
          Loading...
```

**After (editable)**

```tsx
          Loading timeline...
```

### Change 2 (around line 749)

**Before**

```tsx
          title="Timeline events loading in the background — scrubbing works everywhere, already-loaded ranges respond instantly"
```

**After (editable)**

```tsx
          title="Timeline events are still loading. You can scrub anywhere; loaded ranges respond immediately."
```

## `components/MemberGrid.tsx`

### Change 1 (around line 413)

**Before**

```tsx
          No members with Discord ranks found.
```

**After (editable)**

```tsx
          No members match these filters.
```

## `components/SourceArchivePanel.tsx`

### Change 1 (around line 97)

**Before**

```tsx
        up yet — the fastest way to add something the Chronicle does not know. The public index is
```

**After (editable)**

```tsx
        up yet. This is the fastest way to add something the Chronicle does not know. The public index is
```

## `components/UniformModal.tsx`

### Change 1 (around line 118)

**Before**

```tsx
              Your own head and hands, the guild&apos;s uniform on the rest. Nothing changes
              until you upload it.
```

**After (editable)**

```tsx
              Preview the TAq uniform on your skin, choose the right fit, then download the
              finished PNG. Your skin stays unchanged until you upload it.
```

### Change 2 (around line 191)

**Before**

```tsx
              Upload the downloaded PNG at minecraft.net (or the launcher&apos;s Skins tab) and pick
              the same arm model there. Capes are separate.
```

**After (editable)**

```tsx
              Upload the PNG on minecraft.net or in the launcher&apos;s Skins tab. Choose the same
              arm model; your cape stays separate.
```

## `components/WarStateBanner.tsx`

### Change 1 (around line 157)

**Before**

```tsx
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{synthetic.label}</span> — {synthetic.note}
```

**After (editable)**

```tsx
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{synthetic.label}</span>: {synthetic.note}
```

### Change 2 (around line 180)

**Before**

```tsx
        `Wynncraft disabled wars on ${DATE_FORMAT_UTC.format(outage.startMs)} and they stayed off for ${describeSpan(outage.startMs, outage.resumeMs)} — territory control was frozen, so the map is accurate and nothing is missing.`,
```

**After (editable)**

```tsx
        `Wynncraft disabled wars on ${DATE_FORMAT_UTC.format(outage.startMs)} for ${describeSpan(outage.startMs, outage.resumeMs)}. Territory control was frozen, so the map is accurate.`,
```

### Change 3 (around line 185)

**Before**

```tsx
        `No exchanges were recorded after ${DATE_FORMAT.format(gap!.start)} — wars continued, but the data is missing, so the map is frozen at the last known state. Have war logs from this era? We’d love a copy!`,
```

**After (editable)**

```tsx
        `No exchanges were recorded after ${DATE_FORMAT.format(gap!.start)}. Wars continued, but the data is missing, so the map is frozen at the last known state. Send us any war logs from this period.`,
```

### Change 4 (around line 215)

**Before**

```tsx
}
```

**After (editable)**

```tsx
}
```

## `components/WikiEditor.tsx`

### Change 1 (around line 156)

**Before**

```tsx
      setError('Upload failed — network error');
```

**After (editable)**

```tsx
      setError('Upload failed. Check your connection and try again.');
```

### Change 2 (around line 202)

**Before**

```tsx
          An exec will review it — approved changes appear with you credited as the author.
```

**After (editable)**

```tsx
          An exec will review it. Approved changes will credit you as the author.
```

### Change 3 (around line 306)

**Before**

```tsx
      <div style={labelStyle}>Summary (the lede — one or two sentences shown above the article and in search)</div>
```

**After (editable)**

```tsx
      <div style={labelStyle}>Summary (one or two sentences shown above the article and in search)</div>
```

### Change 4 (around line 417)

**Before**

```tsx
          placeholder="Edit summary (what changed and why — shown in page history)"
```

**After (editable)**

```tsx
          placeholder="Edit summary (what changed and why; shown in page history)"
```

## `components/WikiEmbeds.tsx`

### Change 1 (around line 36)

**Before**

```tsx
          Live embed — renders on the article page
```

**After (editable)**

```tsx
          Live embed. Renders on the article page.
```

### Change 2 (around line 227)

**Before**

```tsx
        Territories held — {data.guildA} vs {data.guildB}
```

**After (editable)**

```tsx
        Territories held: {data.guildA} vs {data.guildB}
```

## `components/WikiMarkdown.tsx`

### Change 1 (around line 213)

**Before**

```tsx
              const tip = cite ? `${cite.title}${cite.locator ? ` — ${cite.locator}` : ""}` : undefined;
```

**After (editable)**

```tsx
              const tip = cite ? `${cite.title}${cite.locator ? `: ${cite.locator}` : ""}` : undefined;
```

## `components/WikiSearchBox.tsx`

### Change 1 (around line 63)

**Before**

```tsx
            <div style={{ padding: "0.6rem 0.9rem", fontSize: "0.8rem", color: "var(--text-secondary)" }}>No pages found.</div>
```

**After (editable)**

```tsx
            <div style={{ padding: "0.6rem 0.9rem", fontSize: "0.8rem", color: "var(--text-secondary)" }}>No Chronicle pages match your search.</div>
```

## `components/WikiUnverifiedBanner.tsx`

### Change 1 (around line 86)

**Before**

```tsx
          wrong — particularly on treaties, dates and who was involved.{' '}
```

**After (editable)**

```tsx
          wrong, particularly on treaties, dates, and who was involved.{' '}
```

### Change 2 (around line 111)

**Before**

```tsx
              {remaining > 0 && ` — ${remaining} more clears this notice`}
```

**After (editable)**

```tsx
              {remaining > 0 && `. ${remaining} more clears this notice`}
```

## `components/charts/ActivityHeatmap.tsx`

### Change 1 (around line 157)

**Before**

```tsx
                        ? `${day} ${String(hour).padStart(2, '0')}:00 — ${cell.average.toFixed(2)} ${unit} avg (${cell.total.toFixed(0)} over ${cell.occurrences} occurrences)`
                        : `${day} ${String(hour).padStart(2, '0')}:00 — no data`}
```

**After (editable)**

```tsx
                        ? `${day} ${String(hour).padStart(2, '0')}:00: ${cell.average.toFixed(2)} ${unit} avg (${cell.total.toFixed(0)} over ${cell.occurrences} occurrences)`
                        : `${day} ${String(hour).padStart(2, '0')}:00: no data`}
```

### Change 2 (around line 183)

**Before**

```tsx
                More — darkest is {max.toFixed(1)} {unit} in one hour
```

**After (editable)**

```tsx
                More. Darkest is {max.toFixed(1)} {unit} in one hour
```

## `components/charts/TrendChart.tsx`

### Change 1 (around line 169)

**Before**

```tsx
      ? `No data in this range — this metric's most recent record is ${formatFull(latest, bucket, tz)}.`
```

**After (editable)**

```tsx
      ? `No data in this range. The latest record is ${formatFull(latest, bucket, tz)}.`
```

### Change 2 (around line 273)

**Before**

```tsx
                <title>Sampler offline — no data recorded</title>
```

**After (editable)**

```tsx
                <title>Sampler offline. No data recorded.</title>
```

## `lib/exec-nav.ts`

### Change 1 (around line 34)

**Before**

```tsx
      { href: '/exec', label: 'Dashboard', desc: 'Exec command center', iconImage: '/images/icons/exec/dashboard.png' },
```

**After (editable)**

```tsx
      { href: '/exec', label: 'Dashboard', desc: 'Guild overview and recent activity', iconImage: '/images/icons/exec/dashboard.png' },
```

### Change 2 (around line 71)

**Before**

```tsx
      { href: '/exec/chronicle', label: 'Chronicle', desc: 'Review map alliance & event submissions', icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253' },
```

**After (editable)**

```tsx
      { href: '/exec/chronicle', label: 'Chronicle', desc: 'Review map alliance and event submissions', icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253' },
```

## `lib/map-tour-steps.ts`

### Change 1 (around line 16)

**Before**

```tsx
    description: 'The map can replay the war for every territory going back years. This quick tour shows you the controls — it only takes a few seconds.',
```

**After (editable)**

```tsx
    description: 'Replay years of territory ownership and wars. This tour covers the history controls.',
```

### Change 2 (around line 23)

**Before**

```tsx
    description: 'Drag or click the bar to jump to any moment, or play back history at your chosen speed. The colored strip shows seasons — right-click one to zoom in — and event dots zoom to their event when clicked.',
```

**After (editable)**

```tsx
    description: 'Drag or click the bar to move through time, or play history at your chosen speed. Right-click a season to zoom in. Select an event dot to jump to it.',
```

### Change 3 (around line 30)

**Before**

```tsx
    description: 'Community-maintained history: alliances and events like wars. Toggle it to tint territories by the alliances that existed at the shown moment and to see event markers on the timeline. You can propose new entries or edits — an admin reviews them before they appear.',
```

**After (editable)**

```tsx
    description: 'Show community-maintained alliances and events for the selected date. You can suggest entries or edits for an admin to review.',
```

### Change 4 (around line 37)

**Before**

```tsx
    description: 'Build your own guild groupings and color the map by them — handy for tracking coalitions the Chronicle doesn\'t cover yet.',
```

**After (editable)**

```tsx
    description: 'Create guild groups and color the map by them. Use this for coalitions not covered by the Chronicle.',
```

### Change 5 (around line 44)

**Before**

```tsx
    description: 'Territory fills, guild names, trade routes, resource outlines, recent-capture highlights and more — tune the map to show exactly what you care about.',
```

**After (editable)**

```tsx
    description: 'Choose which territory fills, guild names, trade routes, resources, and recent captures the map shows.',
```

## `lib/onboarding-steps.ts`

### Change 1 (around line 24)

**Before**

```tsx
    description: "This is your command center for managing the guild. You can skip the tour if you want but if I get any DMs about stuff in this, I'll send Tort after you.",
```

**After (editable)**

```tsx
    description: 'Use this dashboard to manage members, guild activity, economy, and internal requests.',
```

### Change 2 (around line 31)

**Before**

```tsx
    description: 'These cards show live stats — pending applications, total members, and who\'s online right now.',
```

**After (editable)**

```tsx
    description: 'These cards show pending applications, total members, and who is online now.',
```

### Change 3 (around line 38)

**Before**

```tsx
    description: 'New applications show up here with their vote counts. Click any application to review it and cast your vote.',
```

**After (editable)**

```tsx
    description: 'New applications appear here with their vote counts. Open one to review it and vote.',
```

### Change 4 (around line 45)

**Before**

```tsx
    description: 'Everything member-related — review applications, track member activity, handle promotions, and manage the blacklist. These are the important ones, PLEASE VOTE ON APPS.',
```

**After (editable)**

```tsx
    description: 'Review applications, track activity, handle promotions, and manage the blacklist.',
```

### Change 5 (around line 52)

**Before**

```tsx
    description: 'Log and browse guild raids, manage raid events, review territory snipes, and track guild bank inventory. A great one-stop shop for guild activities.',
```

**After (editable)**

```tsx
    description: 'Log guild raids, manage raid events, review territory snipes, and track guild-bank inventory.',
```

### Change 6 (around line 59)

**Before**

```tsx
    description: 'Manage the shell currency system — member balances, exchange rates, and profile background purchases (thank god old background management made me sad) — plus ingredient stock and guild accounting.',
```

**After (editable)**

```tsx
    description: 'Manage shell balances, exchange rates, profile backgrounds, ingredient stock, and guild accounting.',
```

### Change 7 (around line 66)

**Before**

```tsx
    description: "Meeting agenda and Requests — report bugs or request features for the bot, mod, or website and track them all in one place.",
```

**After (editable)**

```tsx
    description: 'Manage meeting topics and track bugs or feature requests for the bot, mod, and website.',
```

### Change 8 (around line 72)

**Before**

```tsx
    title: "That's the tour!",
    description: "You're all set. If you ever need a refresher, you can replay this tour anytime from the ? button in the bottom left of the sidebar.",
```

**After (editable)**

```tsx
    title: 'Tour complete',
    description: 'Replay this tour from the ? button at the bottom of the sidebar.',
```

## `lib/wiki-embed-db.ts`

### Change 1 (around line 246)

**Before**

```tsx
      message: `Neither “${guildA}” nor “${guildB}” appears in that window — check the full guild names`,
```

**After (editable)**

```tsx
      message: `Neither “${guildA}” nor “${guildB}” appears in that window. Check the full guild names.`,
```


