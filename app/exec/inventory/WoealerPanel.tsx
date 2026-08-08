"use client";

import { DragEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styles from './inventory.module.css';
import { CloseButton, WynnIcon } from './WynnIcon';
import { moveToIndex, type WoealerData, type WoealerPage, type WoealerSlot } from '@/lib/woealer';

interface PageDraft {
  id?: number;
  name: string;
  shared: boolean;
  archived: boolean;
}

interface SlotDraft {
  id?: number;
  pageId: number;
  label: string;
  contents: string;
}

interface SearchHit {
  page: WoealerPage;
  slot: WoealerSlot;
}

const EMPTY: WoealerData = { pages: [], slots: [] };

export default function WoealerPanel({ canEdit }: { canEdit: boolean }) {
  const [data, setData] = useState<WoealerData>(EMPTY);
  const [activePageId, setActivePageId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [pageDialog, setPageDialog] = useState<PageDraft | null>(null);
  const [deletePageDialog, setDeletePageDialog] = useState<WoealerPage | null>(null);
  const [slotDraft, setSlotDraft] = useState<SlotDraft | null>(null);
  const [deleteSlotDialog, setDeleteSlotDialog] = useState<WoealerSlot | null>(null);
  const [notesDraft, setNotesDraft] = useState<string | null>(null);
  const [managePagesOpen, setManagePagesOpen] = useState(false);
  const [highlightSlotId, setHighlightSlotId] = useState<number | null>(null);
  const [dragSlotId, setDragSlotId] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [dragPageId, setDragPageId] = useState<number | null>(null);
  const [pageDropIndex, setPageDropIndex] = useState<number | null>(null);
  const slotBodyRef = useRef<HTMLTableSectionElement>(null);
  const pageBodyRef = useRef<HTMLTableSectionElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/exec/woealer', { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Could not load Woealer pages.');
      setData({ pages: payload.pages ?? [], slots: payload.slots ?? [] });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load Woealer pages.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!canEdit) setEditing(false);
  }, [canEdit]);

  const visiblePages = useMemo(() => data.pages.filter(page => !page.archived), [data.pages]);
  const sharedPages = useMemo(() => visiblePages.filter(page => page.shared), [visiblePages]);
  const characterPages = useMemo(() => visiblePages.filter(page => !page.shared), [visiblePages]);

  useEffect(() => {
    if (visiblePages.length === 0) {
      setActivePageId(null);
      return;
    }
    if (activePageId === null || !visiblePages.some(page => page.id === activePageId)) {
      setActivePageId(visiblePages[0].id);
    }
  }, [visiblePages, activePageId]);

  useEffect(() => {
    if (highlightSlotId === null) return;
    document.getElementById(`woealer-slot-${highlightSlotId}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const timer = setTimeout(() => setHighlightSlotId(null), 2400);
    return () => clearTimeout(timer);
  }, [highlightSlotId]);

  const activePage = useMemo(
    () => visiblePages.find(page => page.id === activePageId) ?? null,
    [visiblePages, activePageId]
  );

  const activeSlots = useMemo(
    () => data.slots.filter(slot => slot.pageId === activePageId).sort((a, b) => a.sortOrder - b.sortOrder),
    [data.slots, activePageId]
  );

  const query = search.trim().toLocaleLowerCase('en-US');

  const searchHits = useMemo<SearchHit[]>(() => {
    if (!query) return [];
    const pagesById = new Map(visiblePages.map(page => [page.id, page]));
    return data.slots
      .filter(slot => (
        pagesById.has(slot.pageId)
        && [slot.contents, slot.label].some(value => value.toLocaleLowerCase('en-US').includes(query))
      ))
      .map(slot => ({ page: pagesById.get(slot.pageId)!, slot }))
      .sort((a, b) => (
        a.page.shared === b.page.shared
          ? a.page.sortOrder - b.page.sortOrder || a.slot.sortOrder - b.slot.sortOrder
          : Number(b.page.shared) - Number(a.page.shared)
      ));
  }, [query, data.slots, visiblePages]);

  /** Returns false and shows the error banner when the request fails. */
  async function post(body: Record<string, unknown>): Promise<boolean> {
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/exec/woealer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Could not update Woealer pages.');
      setData({ pages: payload.pages ?? [], slots: payload.slots ?? [] });
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update Woealer pages.');
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function send(url: string, method: 'PATCH' | 'DELETE', body?: Record<string, unknown>): Promise<boolean> {
    setSaving(true);
    setError('');
    try {
      const response = await fetch(url, {
        method,
        ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Could not save your change.');
      await load();
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save your change.');
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function savePage(event: FormEvent) {
    event.preventDefault();
    if (!pageDialog?.name.trim()) return;
    const saved = pageDialog.id
      ? await send(`/api/exec/woealer/pages/${pageDialog.id}`, 'PATCH', {
        name: pageDialog.name,
        shared: pageDialog.shared,
        archived: pageDialog.archived,
      })
      : await post({ action: 'createPage', name: pageDialog.name, shared: pageDialog.shared });
    if (saved) setPageDialog(null);
  }

  async function deletePage(event: FormEvent) {
    event.preventDefault();
    if (!deletePageDialog) return;
    if (await send(`/api/exec/woealer/pages/${deletePageDialog.id}`, 'DELETE')) {
      setDeletePageDialog(null);
    }
  }

  async function saveSlot(event: FormEvent) {
    event.preventDefault();
    if (!slotDraft?.label.trim()) return;
    const saved = slotDraft.id
      ? await send(`/api/exec/woealer/slots/${slotDraft.id}`, 'PATCH', {
        label: slotDraft.label,
        contents: slotDraft.contents,
      })
      : await post({
        action: 'createSlot',
        pageId: slotDraft.pageId,
        label: slotDraft.label,
        contents: slotDraft.contents,
      });
    if (saved) setSlotDraft(null);
  }

  async function deleteSlot(event: FormEvent) {
    event.preventDefault();
    if (!deleteSlotDialog) return;
    if (await send(`/api/exec/woealer/slots/${deleteSlotDialog.id}`, 'DELETE')) {
      setDeleteSlotDialog(null);
    }
  }

  async function saveNotes(event: FormEvent) {
    event.preventDefault();
    if (!activePage || notesDraft === null) return;
    const saved = await send(`/api/exec/woealer/pages/${activePage.id}`, 'PATCH', {
      action: 'updateNotes',
      notes: notesDraft,
    });
    if (saved) setNotesDraft(null);
  }

  async function reorderSlots(ordered: WoealerSlot[]) {
    await post({ action: 'reorder', entity: 'slot', ids: ordered.map(slot => slot.id) });
  }

  async function moveSlot(slot: WoealerSlot, direction: -1 | 1) {
    const ordered = activeSlots.slice();
    const index = ordered.findIndex(candidate => candidate.id === slot.id);
    const target = index + direction;
    if (target < 0 || target >= ordered.length) return;
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    await reorderSlots(ordered);
  }

  async function reorderPages(ordered: WoealerPage[]) {
    await post({ action: 'reorder', entity: 'page', ids: ordered.map(page => page.id) });
  }

  function pageSiblings(page: WoealerPage) {
    return data.pages
      .filter(candidate => candidate.shared === page.shared)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async function movePage(page: WoealerPage, direction: -1 | 1) {
    const ordered = pageSiblings(page);
    const index = ordered.findIndex(candidate => candidate.id === page.id);
    const target = index + direction;
    if (target < 0 || target >= ordered.length) return;
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    await reorderPages(ordered);
  }

  /**
   * How many of `siblings` sit above the pointer. The manage-pages table renders
   * both groups in one tbody but reorders within a group, so a raw row index
   * would be wrong there.
   */
  function dropIndexFor(
    body: HTMLTableSectionElement | null,
    clientY: number,
    siblings: { id: number }[]
  ): number {
    if (!body) return siblings.length;
    const siblingIds = new Set(siblings.map(item => item.id));
    let index = 0;
    for (const row of body.querySelectorAll('tr[data-row-id]')) {
      const rect = row.getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) break;
      if (siblingIds.has(Number(row.getAttribute('data-row-id')))) index += 1;
    }
    return index;
  }

  // The dragged id travels on the dataTransfer, not in state: the drop can land
  // before React has committed the dragstart render.
  function draggedId(event: DragEvent): number | null {
    const id = Number(event.dataTransfer.getData('text/plain'));
    return Number.isInteger(id) && id > 0 ? id : null;
  }

  function onSlotDragOver(event: DragEvent) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDropIndex(dropIndexFor(slotBodyRef.current, event.clientY, activeSlots));
  }

  async function onSlotDrop(event: DragEvent) {
    event.preventDefault();
    const index = dropIndexFor(slotBodyRef.current, event.clientY, activeSlots);
    const id = draggedId(event);
    setDragSlotId(null);
    setDropIndex(null);
    if (id === null || !activeSlots.some(slot => slot.id === id)) return;
    const next = moveToIndex(activeSlots, id, index);
    if (next) await reorderSlots(next);
  }

  function onPageDragOver(event: DragEvent) {
    const dragged = data.pages.find(page => page.id === dragPageId);
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    if (dragged) setPageDropIndex(dropIndexFor(pageBodyRef.current, event.clientY, pageSiblings(dragged)));
  }

  async function onPageDrop(event: DragEvent) {
    event.preventDefault();
    const id = draggedId(event);
    setDragPageId(null);
    setPageDropIndex(null);
    const dragged = id === null ? undefined : data.pages.find(page => page.id === id);
    if (!dragged) return;
    const siblings = pageSiblings(dragged);
    const next = moveToIndex(siblings, dragged.id, dropIndexFor(pageBodyRef.current, event.clientY, siblings));
    if (next) await reorderPages(next);
  }

  function openSearchHit(hit: SearchHit) {
    setActivePageId(hit.page.id);
    setSearch('');
    setHighlightSlotId(hit.slot.id);
  }

  function renderPageChips(pages: WoealerPage[], label: string) {
    if (pages.length === 0) return null;
    return (
      <div className={styles.woealerPageGroup}>
        <span className={styles.filterGroupLabel}>{label}</span>
        <div className={styles.filterChips}>
          {pages.map(page => (
            <button
              key={page.id}
              type="button"
              aria-current={page.id === activePageId}
              className={page.id === activePageId ? styles.filterChipActive : styles.filterChip}
              onClick={() => setActivePageId(page.id)}
            >
              {page.name}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const managedPages = useMemo(
    () => [...data.pages].sort((a, b) => (
      a.shared === b.shared ? a.sortOrder - b.sortOrder : Number(b.shared) - Number(a.shared)
    )),
    [data.pages]
  );

  return (
    <div className={styles.woealer}>
      {error && (
        <div className={styles.error} role="alert">
          <span>{error}</span>
          <button onClick={() => setError('')} aria-label="Dismiss error"><WynnIcon name="cancel" /></button>
        </div>
      )}

      <div className={styles.controls}>
        <div className={styles.controlActions}>
          <label className={styles.search}>
            <span className={styles.visuallyHidden}>Search every Woealer page</span>
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Find an item across all pages…"
            />
          </label>
          {canEdit && (
            <button className={styles.secondaryButton} onClick={() => setManagePagesOpen(true)}>
              Manage pages
            </button>
          )}
          {canEdit && (
            <button
              className={styles.primaryButton}
              onClick={() => setPageDialog({ name: '', shared: false, archived: false })}
            >
              Add page
            </button>
          )}
        </div>
      </div>

      {!canEdit && (
        <p className={styles.readOnlyNote}>
          Narwhal, Hydra, and Leader ranks maintain this map. You can browse and search it.
        </p>
      )}

      {loading ? (
        <div className={styles.skeletons} aria-label="Loading Woealer pages">
          {[0, 1, 2].map(value => <div key={value} />)}
        </div>
      ) : query ? (
        <div className={styles.woealerResults}>
          <p className={styles.woealerResultsCount}>
            {searchHits.length === 0
              ? `Nothing on Woealer matches “${search.trim()}”.`
              : `${searchHits.length} ${searchHits.length === 1 ? 'slot' : 'slots'} match “${search.trim()}”.`}
          </p>
          {searchHits.map(hit => (
            <button
              key={hit.slot.id}
              type="button"
              className={styles.woealerResult}
              onClick={() => openSearchHit(hit)}
            >
              <span className={styles.woealerResultPage}>
                {hit.page.name}
                <em>{hit.page.shared ? 'Account bank' : 'Character bank'}</em>
              </span>
              <span className={styles.woealerResultSlot}>{hit.slot.label}</span>
              <span className={styles.woealerResultContents}>{hit.slot.contents || '—'}</span>
            </button>
          ))}
        </div>
      ) : visiblePages.length === 0 ? (
        <div className={styles.empty}>
          {canEdit
            ? 'No Woealer pages yet. Add one for the account bank and one per character slot, then fill in what each bank page holds.'
            : 'No Woealer pages have been set up yet.'}
        </div>
      ) : (
        <>
          <div className={styles.woealerPageStrip}>
            {renderPageChips(sharedPages, 'Account-wide')}
            {renderPageChips(characterPages, 'Character banks')}
          </div>

          {activePage && (
            <section className={styles.woealerSurface}>
              <div className={styles.woealerNotes} aria-label={`${activePage.name} notes`}>
                {notesDraft !== null ? (
                  <form onSubmit={saveNotes}>
                    <label className={styles.visuallyHidden} htmlFor="woealer-notes">Page notes</label>
                    <textarea
                      id="woealer-notes"
                      autoFocus
                      rows={3}
                      value={notesDraft}
                      onChange={event => setNotesDraft(event.target.value)}
                      placeholder="Anything worth knowing about this page."
                    />
                    <div className={styles.modalActions}>
                      <button type="button" className={styles.secondaryButton} onClick={() => setNotesDraft(null)}>
                        Cancel
                      </button>
                      <button type="submit" className={styles.primaryButton} disabled={saving}>
                        {saving ? 'Saving…' : 'Save notes'}
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <div>
                      <span className={styles.eyebrow}>Notes</span>
                      {activePage.notes
                        ? <p>{activePage.notes}</p>
                        : <p className={styles.woealerNotesEmpty}>No notes on this page.</p>}
                    </div>
                    {canEdit && (
                      <button className={styles.secondaryButton} onClick={() => setNotesDraft(activePage.notes)}>
                        {activePage.notes ? 'Edit notes' : 'Add notes'}
                      </button>
                    )}
                  </>
                )}
              </div>

              <div className={styles.woealerTableHeader}>
                <h2>{activePage.name}</h2>
                {canEdit && (
                  <div className={styles.categoryActions}>
                    {editing && (
                      <button
                        className={styles.secondaryButton}
                        onClick={() => setSlotDraft({ pageId: activePage.id, label: '', contents: '' })}
                      >
                        Add slot
                      </button>
                    )}
                    <button
                      className={editing ? styles.primaryButton : styles.secondaryButton}
                      onClick={() => setEditing(current => !current)}
                    >
                      {editing ? 'Done' : 'Edit slots'}
                    </button>
                  </div>
                )}
              </div>

              {activeSlots.length === 0 ? (
                <div className={styles.empty}>Nothing recorded on this page yet.</div>
              ) : (
                <div className={styles.tableWrap}>
                  <table className={styles.woealerTable}>
                    <thead>
                      <tr>
                        {editing && <th><span className={styles.visuallyHidden}>Reorder</span></th>}
                        <th>Bank page</th>
                        <th>Contents</th>
                        {editing && <th><span className={styles.visuallyHidden}>Actions</span></th>}
                      </tr>
                    </thead>
                    <tbody
                      ref={slotBodyRef}
                      onDragOver={editing ? onSlotDragOver : undefined}
                      onDrop={editing ? event => void onSlotDrop(event) : undefined}
                    >
                      {activeSlots.map((slot, index) => (
                        <tr
                          key={slot.id}
                          id={`woealer-slot-${slot.id}`}
                          data-row-id={slot.id}
                          draggable={editing && !saving}
                          onDragStart={editing ? event => {
                            setDragSlotId(slot.id);
                            event.dataTransfer.effectAllowed = 'move';
                            event.dataTransfer.setData('text/plain', String(slot.id));
                          } : undefined}
                          onDragEnd={() => { setDragSlotId(null); setDropIndex(null); }}
                          className={[
                            slot.id === highlightSlotId ? styles.woealerHighlight : '',
                            editing ? styles.woealerDraggable : '',
                            slot.id === dragSlotId ? styles.woealerDragging : '',
                            dropIndex === index ? styles.woealerDropBefore : '',
                            dropIndex === activeSlots.length && index === activeSlots.length - 1
                              ? styles.woealerDropAfter : '',
                          ].filter(Boolean).join(' ') || undefined}
                        >
                          {editing && (
                            <td className={styles.woealerGripCell}>
                              <span className={styles.woealerGrip} aria-hidden="true" />
                            </td>
                          )}
                          <td className={styles.woealerLabelCell}>
                            <strong className={styles.woealerSlotLabel}>{slot.label}</strong>
                          </td>
                          <td className={styles.woealerSlotContents}>{slot.contents || '—'}</td>
                          {editing && (
                            <td className={styles.woealerActionsCell}>
                              <div className={styles.rowActions}>
                                <button
                                  className={styles.iconButton}
                                  onClick={() => void moveSlot(slot, -1)}
                                  disabled={saving || index === 0}
                                  aria-label={`Move ${slot.label} up`}
                                >
                                  <WynnIcon name="arrow-up" />
                                </button>
                                <button
                                  className={styles.iconButton}
                                  onClick={() => void moveSlot(slot, 1)}
                                  disabled={saving || index === activeSlots.length - 1}
                                  aria-label={`Move ${slot.label} down`}
                                >
                                  <WynnIcon name="arrow-down" />
                                </button>
                                <button onClick={() => setSlotDraft({
                                  id: slot.id,
                                  pageId: slot.pageId,
                                  label: slot.label,
                                  contents: slot.contents,
                                })}>
                                  Edit
                                </button>
                                <button className={styles.dangerText} onClick={() => setDeleteSlotDialog(slot)} disabled={saving}>
                                  Delete
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </>
      )}

      {canEdit && managePagesOpen && (
        <div className={styles.modalBackdrop} role="presentation" onMouseDown={event => {
          if (event.currentTarget === event.target) setManagePagesOpen(false);
        }}>
          <section className={`${styles.modal} ${styles.scanProfilesModal}`} role="dialog" aria-modal="true" aria-label="Manage Woealer pages">
            <div className={styles.modalHeader}>
              <div>
                <span className={styles.eyebrow}>Woealer</span>
                <h2>Storage pages</h2>
              </div>
              <CloseButton onClick={() => setManagePagesOpen(false)} />
            </div>
            <div className={styles.categoryActions}>
              <button
                className={styles.primaryButton}
                onClick={() => setPageDialog({ name: '', shared: false, archived: false })}
              >
                Add page
              </button>
            </div>
            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th><span className={styles.visuallyHidden}>Reorder</span></th>
                    <th>Page</th>
                    <th>Where</th>
                    <th>Slots</th>
                    <th><span className={styles.visuallyHidden}>Actions</span></th>
                  </tr>
                </thead>
                <tbody
                  ref={pageBodyRef}
                  onDragOver={onPageDragOver}
                  onDrop={event => void onPageDrop(event)}
                >
                  {managedPages.map(page => {
                    const siblings = pageSiblings(page);
                    const position = siblings.findIndex(candidate => candidate.id === page.id);
                    const dragging = data.pages.find(candidate => candidate.id === dragPageId);
                    const marked = Boolean(dragging) && dragging!.shared === page.shared && pageDropIndex === position;
                    return (
                      <tr
                        key={page.id}
                        data-row-id={page.id}
                        draggable={!saving}
                        onDragStart={event => {
                          setDragPageId(page.id);
                          event.dataTransfer.effectAllowed = 'move';
                          event.dataTransfer.setData('text/plain', String(page.id));
                        }}
                        onDragEnd={() => { setDragPageId(null); setPageDropIndex(null); }}
                        className={[
                          styles.woealerDraggable,
                          page.id === dragPageId ? styles.woealerDragging : '',
                          marked ? styles.woealerDropBefore : '',
                        ].filter(Boolean).join(' ') || undefined}
                      >
                        <td className={styles.woealerGripCell}>
                          <span className={styles.woealerGrip} aria-hidden="true" />
                        </td>
                        <td>{page.name}{page.archived && ' (archived)'}</td>
                        <td>{page.shared ? 'Account bank' : 'Character bank'}</td>
                        <td>{data.slots.filter(slot => slot.pageId === page.id).length}</td>
                        <td className={styles.woealerActionsCell}>
                          <div className={styles.rowActions}>
                            <button
                              className={styles.iconButton}
                              onClick={() => void movePage(page, -1)}
                              disabled={saving || position === 0}
                              aria-label={`Move ${page.name} up`}
                            >
                              <WynnIcon name="arrow-up" />
                            </button>
                            <button
                              className={styles.iconButton}
                              onClick={() => void movePage(page, 1)}
                              disabled={saving || position === siblings.length - 1}
                              aria-label={`Move ${page.name} down`}
                            >
                              <WynnIcon name="arrow-down" />
                            </button>
                            <button onClick={() => setPageDialog({
                              id: page.id,
                              name: page.name,
                              shared: page.shared,
                              archived: page.archived,
                            })}>
                              Edit
                            </button>
                            <button className={styles.dangerText} onClick={() => setDeletePageDialog(page)}>Delete</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {data.pages.length === 0 && (
                    <tr><td colSpan={5}>No Woealer pages yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {pageDialog && (
        <div className={styles.modalBackdrop} role="presentation" onMouseDown={event => {
          if (event.currentTarget === event.target) setPageDialog(null);
        }}>
          <form className={`${styles.modal} ${styles.smallModal}`} onSubmit={savePage}>
            <div className={styles.modalHeader}>
              <h2>{pageDialog.id ? 'Edit page' : 'Add Woealer page'}</h2>
              <CloseButton onClick={() => setPageDialog(null)} />
            </div>
            <div className={styles.formGrid}>
              <label className={styles.fullField}>Page name
                <input
                  autoFocus
                  required
                  value={pageDialog.name}
                  onChange={event => setPageDialog({ ...pageDialog, name: event.target.value })}
                  placeholder="e.g. Dry Consu"
                />
              </label>
              <label className={styles.fullField}>Where
                <select
                  value={pageDialog.shared ? 'shared' : 'character'}
                  onChange={event => setPageDialog({ ...pageDialog, shared: event.target.value === 'shared' })}
                >
                  <option value="character">Character bank</option>
                  <option value="shared">Account bank</option>
                </select>
              </label>
              {pageDialog.id && (
                <label className={styles.checkboxField}>
                  <input
                    type="checkbox"
                    checked={pageDialog.archived}
                    onChange={event => setPageDialog({ ...pageDialog, archived: event.target.checked })}
                  />
                  Archived (hidden from the page strip and search)
                </label>
              )}
            </div>
            <div className={styles.modalActions}>
              <button type="button" className={styles.secondaryButton} onClick={() => setPageDialog(null)}>Cancel</button>
              <button type="submit" className={styles.primaryButton} disabled={saving}>
                {saving ? 'Saving…' : 'Save page'}
              </button>
            </div>
          </form>
        </div>
      )}

      {deletePageDialog && (
        <div className={styles.modalBackdrop} role="presentation" onMouseDown={event => {
          if (event.currentTarget === event.target) setDeletePageDialog(null);
        }}>
          <form className={`${styles.modal} ${styles.smallModal}`} onSubmit={deletePage}>
            <div className={styles.modalHeader}>
              <div>
                <span className={styles.eyebrow}>Delete page</span>
                <h2>{deletePageDialog.name}</h2>
              </div>
              <CloseButton onClick={() => setDeletePageDialog(null)} />
            </div>
            <p className={styles.modalCopy}>
              This permanently removes {deletePageDialog.name} and all{' '}
              {data.slots.filter(slot => slot.pageId === deletePageDialog.id).length} of its slots. Archive it
              instead if you only want it out of the way.
            </p>
            <div className={styles.modalActions}>
              <button type="button" className={styles.secondaryButton} onClick={() => setDeletePageDialog(null)}>Cancel</button>
              <button type="submit" className={styles.dangerButton} disabled={saving}>Delete permanently</button>
            </div>
          </form>
        </div>
      )}

      {slotDraft && (
        <div className={styles.modalBackdrop} role="presentation" onMouseDown={event => {
          if (event.currentTarget === event.target) setSlotDraft(null);
        }}>
          <form className={`${styles.modal} ${styles.smallModal}`} onSubmit={saveSlot}>
            <div className={styles.modalHeader}>
              <h2>{slotDraft.id ? 'Edit slot' : 'Add slot'}</h2>
              <CloseButton onClick={() => setSlotDraft(null)} />
            </div>
            <div className={styles.formGrid}>
              <label className={styles.fullField}>Bank page
                <input
                  autoFocus
                  required
                  value={slotDraft.label}
                  onChange={event => setSlotDraft({ ...slotDraft, label: event.target.value })}
                  placeholder="e.g. 7 or D4"
                />
              </label>
              <label className={styles.fullField}>Contents
                <textarea
                  rows={3}
                  value={slotDraft.contents}
                  onChange={event => setSlotDraft({ ...slotDraft, contents: event.target.value })}
                  placeholder="What is stored here — list item names so search can find them."
                />
              </label>
            </div>
            <div className={styles.modalActions}>
              <button type="button" className={styles.secondaryButton} onClick={() => setSlotDraft(null)}>Cancel</button>
              <button type="submit" className={styles.primaryButton} disabled={saving}>
                {saving ? 'Saving…' : 'Save slot'}
              </button>
            </div>
          </form>
        </div>
      )}

      {deleteSlotDialog && (
        <div className={styles.modalBackdrop} role="presentation" onMouseDown={event => {
          if (event.currentTarget === event.target) setDeleteSlotDialog(null);
        }}>
          <form className={`${styles.modal} ${styles.smallModal}`} onSubmit={deleteSlot}>
            <div className={styles.modalHeader}>
              <div>
                <span className={styles.eyebrow}>Delete slot</span>
                <h2>{deleteSlotDialog.label}</h2>
              </div>
              <CloseButton onClick={() => setDeleteSlotDialog(null)} />
            </div>
            <p className={styles.modalCopy}>This removes the record of what is on this bank page.</p>
            <div className={styles.modalActions}>
              <button type="button" className={styles.secondaryButton} onClick={() => setDeleteSlotDialog(null)}>Cancel</button>
              <button type="submit" className={styles.dangerButton} disabled={saving}>Delete</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
