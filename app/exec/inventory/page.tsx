"use client";

import { CSSProperties, Fragment, FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useExecSession } from '@/hooks/useExecSession';
import styles from './inventory.module.css';

type Kind = 'ingredient' | 'consumable' | 'material';
type Bucket = 'misc_bucket' | 'account_bank' | 'character_bank' | 'materials_bucket';
type View = Kind | 'archive';

interface Category {
  id: number;
  kind: Kind;
  name: string;
  slug: string;
  sortOrder: number;
  archived: boolean;
}

interface InventoryItem {
  id: number;
  kind: Kind;
  categoryId: number;
  name: string;
  scanKey: string;
  aliases: string[];
  quantity: number;
  reserveQuantity: number;
  desiredQuantity: number | null;
  enough: boolean | null;
  usedBy: string | null;
  bankPage: string | null;
  reserveBankPage: string | null;
  charges: number | null;
  recipeUrl: string | null;
  storageBucket: Bucket;
  notes: string | null;
  texturePath: string | null;
  exchange: {
    key: string;
    shells: number;
    per: number;
    highlight: boolean;
    toggled: boolean;
    imageUrl: string;
  } | null;
  sortOrder: number;
  archived: boolean;
  archivedAt: string | null;
  updatedBy: string | null;
  updatedAt: string;
}

interface InventoryScan {
  id: number;
  scanType: Bucket;
  uploadedBy: string;
  receivedAt: string;
  reportedItems: number;
  matchedItems: number;
}

interface ScanProfile {
  id: number;
  nickname: string;
  contentType: 'consumables' | 'ingredients' | 'materials';
  sourceKey: string;
  displayName: string;
  startPage: number;
  totalPages: number;
  locationPrefix: string;
  sortOrder: number;
  archived: boolean;
}

interface InventoryData {
  categories: Category[];
  items: InventoryItem[];
  scans: InventoryScan[];
  scanProfiles: ScanProfile[];
  exchangeMaterials: Array<{
    key: string;
    name: string;
    tiers: Record<string, any>;
    imageUrl: string;
  }>;
}

interface TextureAsset {
  id: string;
  name: string;
  url: string;
  source: 'inventory' | 'shell-exchange' | 'uploaded';
  kind: 'ingredient' | 'consumable' | 'material' | 'custom' | 'unassigned';
}

interface ItemDraft {
  id?: number;
  kind: Kind;
  categoryId: string;
  name: string;
  scanKey: string;
  aliases: string;
  quantity: string;
  reserveQuantity: string;
  desiredQuantity: string;
  usedBy: string;
  bankPage: string;
  reserveBankPage: string;
  charges: string;
  recipeUrl: string;
  storageBucket: Bucket;
  notes: string;
  texturePath: string;
  archived: boolean;
}

interface ScanProfileDraft {
  id?: number;
  nickname: string;
  contentType: 'consumables' | 'ingredients' | 'materials';
  displayName: string;
  startPage: string;
  totalPages: string;
  locationPrefix: string;
  archived: boolean;
}

// Materials are 3 rows per family+kind (T1/T2/T3); grouped back into one row here.
interface MaterialGroup {
  baseName: string;
  tiers: (InventoryItem | undefined)[]; // index 0 = T1, 1 = T2, 2 = T3
}

interface MaterialTierDraft {
  id: number;
  tier: number;
  quantity: string;
  desiredQuantity: string;
  bankPage: string;
}

interface MaterialGroupDraft {
  baseName: string;
  tiers: MaterialTierDraft[];
}

const EMPTY: InventoryData = { categories: [], items: [], scans: [], scanProfiles: [], exchangeMaterials: [] };
const NARWHAL_RANKS = new Set(['Narwhal', 'Hydra', '✫✪✫ Hydra - Leader']);
// Matches the tier colors the mod reads from item lore.
const TIER_COLORS: Record<number, string> = { 1: '#E6E647', 2: '#E647E6', 3: '#47E6E6' };
// Scan strip groups: account_bank + character_bank collapse into one "Consu" tile.
const SCAN_GROUPS: Array<{ label: string; buckets: Bucket[] }> = [
  { label: 'Ingredients', buckets: ['misc_bucket'] },
  { label: 'Consu', buckets: ['account_bank', 'character_bank'] },
  { label: 'Materials', buckets: ['materials_bucket'] },
];

function stackAmount(quantity: number): string {
  const stacks = Math.floor(quantity / 64);
  const remainder = quantity % 64;
  return stacks ? `${stacks} stx + ${remainder}` : `${remainder}`;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function parseMaterialTier(name: string): { baseName: string; tier: number } | null {
  const match = name.match(/^(.*) T([1-3])$/);
  return match ? { baseName: match[1], tier: Number(match[2]) } : null;
}

function groupMaterialItems(items: InventoryItem[]): MaterialGroup[] {
  const groups = new Map<string, MaterialGroup>();
  for (const item of items) {
    const parsed = parseMaterialTier(item.name);
    if (!parsed) continue;
    const group = groups.get(parsed.baseName) ?? { baseName: parsed.baseName, tiers: [undefined, undefined, undefined] };
    group.tiers[parsed.tier - 1] = item;
    groups.set(parsed.baseName, group);
  }
  return Array.from(groups.values());
}

function materialGroupDraft(group: MaterialGroup): MaterialGroupDraft {
  return {
    baseName: group.baseName,
    tiers: group.tiers
      .map((item, index) => item && {
        id: item.id,
        tier: index + 1,
        quantity: String(item.quantity),
        desiredQuantity: item.desiredQuantity === null ? '' : String(item.desiredQuantity),
        bankPage: item.bankPage ?? '',
      })
      .filter((tier): tier is MaterialTierDraft => Boolean(tier)),
  };
}

function scanProfileDraft(profile: ScanProfile): ScanProfileDraft {
  return {
    id: profile.id,
    nickname: profile.nickname,
    contentType: profile.contentType,
    displayName: profile.displayName,
    startPage: String(profile.startPage),
    totalPages: String(profile.totalPages),
    locationPrefix: profile.locationPrefix,
    archived: profile.archived,
  };
}

function itemDraft(item: InventoryItem): ItemDraft {
  return {
    id: item.id,
    kind: item.kind,
    categoryId: String(item.categoryId),
    name: item.name,
    scanKey: item.scanKey,
    aliases: item.aliases.join(', '),
    quantity: String(item.quantity),
    reserveQuantity: String(item.reserveQuantity),
    desiredQuantity: item.desiredQuantity === null ? '' : String(item.desiredQuantity),
    usedBy: item.usedBy ?? '',
    bankPage: item.bankPage ?? '',
    reserveBankPage: item.reserveBankPage ?? '',
    charges: item.charges === null ? '' : String(item.charges),
    recipeUrl: item.recipeUrl ?? '',
    storageBucket: item.storageBucket,
    notes: item.notes ?? '',
    texturePath: item.texturePath ?? '',
    archived: item.archived,
  };
}

export default function InventoryPage() {
  const { user } = useExecSession();
  const canEdit = NARWHAL_RANKS.has(user?.rank ?? '');
  const canAddItems = Boolean(user);
  const [data, setData] = useState<InventoryData>(EMPTY);
  const [view, setView] = useState<View>('ingredient');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<ItemDraft | null>(null);
  const [categoryDialog, setCategoryDialog] = useState<{ id?: number; kind: Kind; name: string } | null>(null);
  const [deleteCategoryDialog, setDeleteCategoryDialog] = useState<{ category: Category; replacementId: string } | null>(null);
  const [deleteItemDialog, setDeleteItemDialog] = useState<InventoryItem | null>(null);
  const [scanProfileDialog, setScanProfileDialog] = useState<ScanProfileDraft | null>(null);
  const [deleteScanProfileDialog, setDeleteScanProfileDialog] = useState<ScanProfile | null>(null);
  const [scanProfilesOpen, setScanProfilesOpen] = useState(false);
  const [materialGroupDialog, setMaterialGroupDialog] = useState<MaterialGroupDraft | null>(null);
  const [deleteMaterialGroupDialog, setDeleteMaterialGroupDialog] = useState<MaterialGroup | null>(null);
  const [textureDialog, setTextureDialog] = useState(false);
  const [textureLibrary, setTextureLibrary] = useState<TextureAsset[]>([]);
  const [textureSearch, setTextureSearch] = useState('');
  const [textureLoading, setTextureLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/exec/inventory', { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Could not load inventory.');
      setData(payload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load inventory.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const activeItems = useMemo(() => data.items.filter(item => !item.archived), [data.items]);
  const enough = activeItems.filter(item => item.enough === true).length;
  const low = activeItems.filter(item => item.enough === false).length;
  const unconfigured = activeItems.filter(item => item.enough === null).length;
  const latestScans = useMemo(() => {
    const scans = new Map<Bucket, InventoryScan>();
    for (const scan of data.scans) {
      if (!scans.has(scan.scanType)) scans.set(scan.scanType, scan);
    }
    return scans;
  }, [data.scans]);

  const visibleItems = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('en-US');
    return data.items.filter(item => {
      const rightView = view === 'archive' ? item.archived : !item.archived && item.kind === view;
      return rightView && (!query || [item.name, item.usedBy, item.bankPage, item.notes]
        .some(value => value?.toLocaleLowerCase('en-US').includes(query)));
    });
  }, [data.items, search, view]);

  const categories = useMemo(() => data.categories
    .filter(category => !category.archived && (view === 'archive' || category.kind === view))
    .filter(category => visibleItems.some(item => item.categoryId === category.id) || view !== 'archive')
    .sort((a, b) => a.sortOrder - b.sortOrder), [data.categories, view, visibleItems]);

  async function post(body: Record<string, unknown>) {
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/exec/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Could not update inventory.');
      if (payload.items) setData(payload);
      else await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update inventory.');
      throw cause;
    } finally {
      setSaving(false);
    }
  }

  async function saveItem(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    const payload = {
      kind: draft.kind,
      categoryId: Number(draft.categoryId),
      name: draft.name,
      scanKey: draft.scanKey || draft.name,
      aliases: draft.aliases.split(',').map(value => value.trim()).filter(Boolean),
      quantity: Number(draft.quantity || 0),
      reserveQuantity: Number(draft.reserveQuantity || 0),
      desiredQuantity: draft.desiredQuantity === '' ? null : Number(draft.desiredQuantity),
      usedBy: draft.usedBy,
      bankPage: draft.bankPage,
      reserveBankPage: draft.reserveBankPage,
      charges: draft.charges === '' ? null : Number(draft.charges),
      recipeUrl: draft.recipeUrl,
      storageBucket: draft.storageBucket,
      notes: draft.notes,
      texturePath: draft.texturePath,
    };
    setSaving(true);
    setError('');
    try {
      const response = await fetch(
        draft.id ? `/api/exec/inventory/${draft.id}` : '/api/exec/inventory',
        {
          method: draft.id ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(draft.id ? payload : { action: 'createItem', ...payload }),
        }
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'Could not save item.');
      setDraft(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save item.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleArchive(item: InventoryItem) {
    setSaving(true);
    setError('');
    try {
      const response = await fetch(`/api/exec/inventory/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: item.archived ? 'restore' : 'archive' }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Could not update archive.');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update archive.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteItem(event: FormEvent) {
    event.preventDefault();
    if (!deleteItemDialog) return;
    setSaving(true);
    setError('');
    try {
      const response = await fetch(`/api/exec/inventory/${deleteItemDialog.id}`, { method: 'DELETE' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Could not delete item.');
      setDeleteItemDialog(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not delete item.');
    } finally {
      setSaving(false);
    }
  }

  function updateMaterialTier(index: number, field: 'quantity' | 'desiredQuantity' | 'bankPage', value: string) {
    setMaterialGroupDialog(current => {
      if (!current) return current;
      const tiers = current.tiers.slice();
      tiers[index] = { ...tiers[index], [field]: value };
      return { ...current, tiers };
    });
  }

  async function saveMaterialGroup(event: FormEvent) {
    event.preventDefault();
    if (!materialGroupDialog) return;
    setSaving(true);
    setError('');
    try {
      await Promise.all(materialGroupDialog.tiers.map(async tier => {
        const item = data.items.find(candidate => candidate.id === tier.id);
        if (!item) return;
        const response = await fetch(`/api/exec/inventory/${tier.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            categoryId: item.categoryId,
            name: item.name,
            scanKey: item.scanKey,
            aliases: item.aliases,
            quantity: Number(tier.quantity || 0),
            reserveQuantity: 0,
            desiredQuantity: tier.desiredQuantity === '' ? null : Number(tier.desiredQuantity),
            usedBy: null,
            bankPage: tier.bankPage || null,
            charges: null,
            recipeUrl: null,
            storageBucket: item.storageBucket,
            notes: null,
            texturePath: item.texturePath,
          }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? 'Could not save material.');
      }));
      setMaterialGroupDialog(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save material.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleArchiveGroup(group: MaterialGroup) {
    const items = group.tiers.filter((item): item is InventoryItem => Boolean(item));
    if (items.length === 0) return;
    const archived = !items[0].archived;
    setSaving(true);
    setError('');
    try {
      await Promise.all(items.map(item => fetch(`/api/exec/inventory/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: archived ? 'archive' : 'restore' }),
      })));
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update archive.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteMaterialGroup(event: FormEvent) {
    event.preventDefault();
    if (!deleteMaterialGroupDialog) return;
    const items = deleteMaterialGroupDialog.tiers.filter((item): item is InventoryItem => Boolean(item));
    setSaving(true);
    setError('');
    try {
      await Promise.all(items.map(item => fetch(`/api/exec/inventory/${item.id}`, { method: 'DELETE' })));
      setDeleteMaterialGroupDialog(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not delete material.');
    } finally {
      setSaving(false);
    }
  }

  async function moveItem(item: InventoryItem, direction: -1 | 1) {
    const siblings = data.items
      .filter(candidate => candidate.categoryId === item.categoryId && candidate.archived === item.archived)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const index = siblings.findIndex(candidate => candidate.id === item.id);
    const target = index + direction;
    if (target < 0 || target >= siblings.length) return;
    [siblings[index], siblings[target]] = [siblings[target], siblings[index]];
    await post({ action: 'reorder', entity: 'item', ids: siblings.map(candidate => candidate.id) });
  }

  async function moveCategory(category: Category, direction: -1 | 1) {
    const siblings = data.categories
      .filter(candidate => candidate.kind === category.kind && !candidate.archived)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const index = siblings.findIndex(candidate => candidate.id === category.id);
    const target = index + direction;
    if (target < 0 || target >= siblings.length) return;
    [siblings[index], siblings[target]] = [siblings[target], siblings[index]];
    await post({ action: 'reorder', entity: 'category', ids: siblings.map(candidate => candidate.id) });
  }

  async function saveScanProfile(event: FormEvent) {
    event.preventDefault();
    if (!scanProfileDialog) return;
    try {
      await post({
        action: scanProfileDialog.id ? 'updateScanProfile' : 'createScanProfile',
        id: scanProfileDialog.id,
        nickname: scanProfileDialog.nickname,
        contentType: scanProfileDialog.contentType,
        displayName: scanProfileDialog.displayName,
        startPage: Number(scanProfileDialog.startPage || 1),
        totalPages: Number(scanProfileDialog.totalPages || 12),
        locationPrefix: scanProfileDialog.locationPrefix,
        archived: scanProfileDialog.archived,
      });
      setScanProfileDialog(null);
    } catch {
      // The persistent error banner contains the actionable message.
    }
  }

  async function deleteScanProfile(event: FormEvent) {
    event.preventDefault();
    if (!deleteScanProfileDialog) return;
    try {
      await post({ action: 'deleteScanProfile', id: deleteScanProfileDialog.id });
      setDeleteScanProfileDialog(null);
    } catch {
      // The persistent error banner contains the actionable message.
    }
  }

  async function moveScanProfile(profile: ScanProfile, direction: -1 | 1) {
    const siblings = data.scanProfiles
      .filter(candidate => candidate.archived === profile.archived)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const index = siblings.findIndex(candidate => candidate.id === profile.id);
    const target = index + direction;
    if (target < 0 || target >= siblings.length) return;
    [siblings[index], siblings[target]] = [siblings[target], siblings[index]];
    await post({ action: 'reorder', entity: 'scanProfile', ids: siblings.map(candidate => candidate.id) });
  }

  async function saveCategory(event: FormEvent) {
    event.preventDefault();
    if (!categoryDialog?.name.trim()) return;
    try {
      await post(categoryDialog.id
        ? { action: 'updateCategory', ...categoryDialog }
        : { action: 'createCategory', ...categoryDialog });
      setCategoryDialog(null);
    } catch {
      // The persistent error banner contains the actionable message.
    }
  }

  async function deleteCategory(event: FormEvent) {
    event.preventDefault();
    if (!deleteCategoryDialog) return;
    try {
      await post({
        action: 'deleteCategory',
        id: deleteCategoryDialog.category.id,
        replacementId: deleteCategoryDialog.replacementId
          ? Number(deleteCategoryDialog.replacementId)
          : null,
      });
      setDeleteCategoryDialog(null);
    } catch {
      // The persistent error banner contains the actionable message.
    }
  }

  async function openTextureLibrary() {
    setTextureDialog(true);
    if (textureLibrary.length > 0) return;
    setTextureLoading(true);
    try {
      const response = await fetch('/api/exec/inventory/textures', { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Could not load textures.');
      setTextureLibrary(payload.assets ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load textures.');
      setTextureDialog(false);
    } finally {
      setTextureLoading(false);
    }
  }

  async function uploadTexture(file: File | null) {
    if (!file) return;
    setTextureLoading(true);
    setError('');
    try {
      const form = new FormData();
      form.set('file', file);
      form.set('name', draft?.name || file.name);
      const response = await fetch('/api/exec/inventory/textures', { method: 'POST', body: form });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Could not upload texture.');
      setTextureLibrary(current => [payload.asset, ...current]);
      setDraft(current => current ? { ...current, texturePath: payload.asset.url } : current);
      setTextureDialog(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not upload texture.');
    } finally {
      setTextureLoading(false);
    }
  }

  function newItem(category: Category) {
    setDraft({
      kind: category.kind,
      categoryId: String(category.id),
      name: '',
      scanKey: '',
      aliases: '',
      quantity: '0',
      reserveQuantity: '0',
      desiredQuantity: '',
      usedBy: '',
      bankPage: '',
      reserveBankPage: '',
      charges: '',
      recipeUrl: '',
      storageBucket: category.kind === 'ingredient' ? 'misc_bucket' : category.kind === 'material' ? 'materials_bucket' : 'account_bank',
      notes: '',
      texturePath: '',
      archived: false,
    });
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <div className={styles.eyebrow}>Management inventory</div>
          <h1>Ingredient, consumable & material inventory</h1>
        </div>
        <div className={styles.headerActions}>
          {canEdit && (
            <button className={styles.secondaryButton} onClick={() => setScanProfilesOpen(true)}>
              Scan profiles
            </button>
          )}
          <button className={styles.secondaryButton} onClick={() => void load()} disabled={loading}>
            Refresh
          </button>
        </div>
      </header>

      <section className={styles.stats} aria-label="Inventory status">
        <div className={styles.stat}>
          <span>Tracked</span>
          <strong>{activeItems.length}</strong>
        </div>
        <div className={`${styles.stat} ${styles.good}`}>
          <span>Enough</span>
          <strong>{enough}</strong>
        </div>
        <div className={`${styles.stat} ${styles.low}`}>
          <span>Below target</span>
          <strong>{low}</strong>
        </div>
        <div className={styles.stat}>
          <span>No target</span>
          <strong>{unconfigured}</strong>
        </div>
      </section>

      <section className={styles.scanStrip} aria-label="Latest uploads">
        {SCAN_GROUPS.map(group => {
          const scan = group.buckets
            .map(bucket => latestScans.get(bucket))
            .filter((candidate): candidate is InventoryScan => Boolean(candidate))
            .sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime())[0];
          return (
            <div key={group.label}>
              <span className={styles.scanDot} data-live={scan ? 'true' : 'false'} />
              <span>
                <strong>{group.label}</strong>
                {scan ? formatDate(scan.receivedAt) : 'No upload yet'}
              </span>
            </div>
          );
        })}
      </section>

      {canEdit && scanProfilesOpen && (
        <div className={styles.modalBackdrop} role="presentation" onMouseDown={event => {
          if (event.currentTarget === event.target) setScanProfilesOpen(false);
        }}>
          <section className={`${styles.modal} ${styles.scanProfilesModal}`} role="dialog" aria-modal="true" aria-label="Character bank scan profiles">
            <div className={styles.modalHeader}>
              <div>
                <span className={styles.eyebrow}>Character bank scan profiles</span>
                <h2>Woealer Class Nickname Layout</h2>
              </div>
              <button type="button" className={styles.closeButton} onClick={() => setScanProfilesOpen(false)} aria-label="Close">×</button>
            </div>
            <div className={styles.categoryActions}>
              <button
                className={styles.primaryButton}
                onClick={() => setScanProfileDialog({
                  nickname: '', contentType: 'consumables', displayName: '', startPage: '1', totalPages: '12', locationPrefix: '', archived: false,
                })}
              >
                Add profile
              </button>
            </div>
            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th>Character nickname</th>
                    <th>Scans as</th>
                    <th>Content</th>
                    <th>Pages</th>
                    <th>Location prefix</th>
                    <th><span className={styles.visuallyHidden}>Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {data.scanProfiles.map(profile => (
                    <tr key={profile.id}>
                      <td>{profile.nickname}{profile.archived && ' (archived)'}</td>
                      <td>{profile.displayName}</td>
                      <td>{profile.contentType}</td>
                      <td>{profile.startPage}–{profile.totalPages}</td>
                      <td>{profile.locationPrefix || '—'}</td>
                      <td>
                        <div className={styles.rowActions}>
                          <button onClick={() => void moveScanProfile(profile, -1)} aria-label={`Move ${profile.nickname} up`}>↑</button>
                          <button onClick={() => void moveScanProfile(profile, 1)} aria-label={`Move ${profile.nickname} down`}>↓</button>
                          <button onClick={() => setScanProfileDialog(scanProfileDraft(profile))}>Edit</button>
                          <button className={styles.dangerText} onClick={() => setDeleteScanProfileDialog(profile)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {data.scanProfiles.length === 0 && (
                    <tr><td colSpan={6}>No character bank profiles configured yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {error && (
        <div className={styles.error} role="alert">
          <span>{error}</span>
          <button onClick={() => setError('')} aria-label="Dismiss error">×</button>
        </div>
      )}

      <div className={styles.controls}>
        <div className={styles.tabs} role="tablist" aria-label="Inventory type">
          {([
            ['ingredient', 'Ingredients'],
            ['consumable', 'Consumables'],
            ['material', 'Materials'],
            ['archive', `Recipe archive (${data.items.filter(item => item.archived).length})`],
          ] as [View, string][]).map(([value, label]) => (
            <button
              key={value}
              role="tab"
              aria-selected={view === value}
              className={view === value ? styles.activeTab : ''}
              onClick={() => setView(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className={styles.controlActions}>
          <label className={styles.search}>
            <span className={styles.visuallyHidden}>Search inventory</span>
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
            <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search stock…" />
          </label>
          {canEdit && view !== 'archive' && (
            <button
              className={styles.secondaryButton}
              onClick={() => setCategoryDialog({ kind: view, name: '' })}
            >
              Add category
            </button>
          )}
        </div>
      </div>

      {!canEdit && (
        <p className={styles.readOnlyNote}>You can add inventory items. Narwhal, Hydra, and Leader ranks can edit existing items and manage categories.</p>
      )}

      {loading ? (
        <div className={styles.skeletons} aria-label="Loading inventory">
          {[0, 1, 2].map(value => <div key={value} />)}
        </div>
      ) : categories.length === 0 ? (
        <div className={styles.empty}>No inventory entries match this view.</div>
      ) : (
        <div className={styles.categoryList}>
          {categories.map(category => {
            const items = visibleItems
              .filter(item => item.categoryId === category.id)
              .sort((a, b) => a.sortOrder - b.sortOrder);
            const entryCount = category.kind === 'material' ? groupMaterialItems(items).length : items.length;
            return (
              <section className={styles.category} key={`${view}-${category.id}`}>
                <div className={styles.categoryHeader}>
                  <div>
                    <h2>{category.name}</h2>
                    <span>{entryCount} {entryCount === 1 ? 'entry' : 'entries'}</span>
                  </div>
                  {canAddItems && view !== 'archive' && (
                    <div className={styles.categoryActions}>
                      {canEdit && (
                        <>
                          <button onClick={() => void moveCategory(category, -1)} aria-label={`Move ${category.name} up`}>↑</button>
                          <button onClick={() => void moveCategory(category, 1)} aria-label={`Move ${category.name} down`}>↓</button>
                          <button onClick={() => setCategoryDialog({ id: category.id, kind: category.kind, name: category.name })}>Rename</button>
                          <button
                            className={styles.dangerText}
                            onClick={() => {
                              const replacement = data.categories.find(candidate => (
                                candidate.kind === category.kind && candidate.id !== category.id && !candidate.archived
                              ));
                              setDeleteCategoryDialog({
                                category,
                                replacementId: replacement ? String(replacement.id) : '',
                              });
                            }}
                          >
                            Delete
                          </button>
                        </>
                      )}
                      <button className={styles.primaryButton} onClick={() => newItem(category)}>Add item</button>
                    </div>
                  )}
                </div>

                <div className={styles.tableWrap}>
                  <table>
                    <thead>
                      <tr>
                        <th>Item</th>
                        {view !== 'archive' && <th>Inventory</th>}
                        {view !== 'archive' && category.kind === 'consumable' && <th>Reserve</th>}
                        {view !== 'archive' && <th>Target</th>}
                        {category.kind === 'consumable' && <th>Used by</th>}
                        <th>Location</th>
                        {view !== 'archive' && category.kind === 'consumable' && <th>Reserve Location</th>}
                        {category.kind === 'consumable' && <th>Charges</th>}
                        {view !== 'archive' && <th>Status</th>}
                        {canEdit && <th><span className={styles.visuallyHidden}>Actions</span></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {category.kind === 'material' ? groupMaterialItems(items).map(group => {
                        const representative = group.tiers.find((item): item is InventoryItem => Boolean(item));
                        if (!representative) return null;
                        const totalQuantity = group.tiers.reduce((sum, item) => sum + (item?.quantity ?? 0), 0);
                        const targets = group.tiers.map(item => item?.desiredQuantity ?? null);
                        const totalTarget = targets.some(target => target !== null)
                          ? targets.reduce((sum: number, target) => sum + (target ?? 0), 0)
                          : null;
                        const enough = totalTarget === null ? null : totalQuantity >= totalTarget;
                        return (
                          <tr key={group.baseName}>
                            <td>
                              <div className={styles.itemIdentity}>
                                <div className={styles.texture}>
                                  {representative.texturePath ? <img src={representative.texturePath} alt="" /> : <span>?</span>}
                                </div>
                                <div><strong>{group.baseName}</strong></div>
                              </div>
                            </td>
                            {view !== 'archive' && (
                              <td className={styles.number}>
                                <div className={styles.tierBreakdown}>
                                  {group.tiers.map((item, index) => (
                                    <span key={index} className={styles.tierChip} style={{ '--tier-color': TIER_COLORS[index + 1] } as CSSProperties}>
                                      T{index + 1}: {item?.quantity ?? 0}
                                    </span>
                                  ))}
                                </div>
                              </td>
                            )}
                            {view !== 'archive' && (
                              <td className={styles.number}>{totalTarget === null ? '—' : totalTarget}</td>
                            )}
                            <td>
                              <div className={styles.tierBreakdown}>
                                {group.tiers.map((item, index) => (
                                  <span key={index} className={styles.tierChip} style={{ '--tier-color': TIER_COLORS[index + 1] } as CSSProperties}>
                                    T{index + 1}: {item?.bankPage || '—'}
                                  </span>
                                ))}
                              </div>
                            </td>
                            {view !== 'archive' && (
                              <td>
                                {enough === null ? (
                                  <span className={`${styles.badge} ${styles.neutralBadge}`}>No target</span>
                                ) : enough ? (
                                  <span className={`${styles.badge} ${styles.goodBadge}`}><i /> Enough</span>
                                ) : (
                                  <span className={`${styles.badge} ${styles.lowBadge}`}><i /> Not enough</span>
                                )}
                              </td>
                            )}
                            {canEdit && (
                              <td>
                                <div className={styles.rowActions}>
                                  <button onClick={() => setMaterialGroupDialog(materialGroupDraft(group))}>Edit</button>
                                  <button
                                    className={representative.archived ? '' : styles.dangerText}
                                    onClick={() => void toggleArchiveGroup(group)}
                                    disabled={saving}
                                  >
                                    {representative.archived ? 'Restore' : 'Archive'}
                                  </button>
                                  <button className={styles.dangerText} onClick={() => setDeleteMaterialGroupDialog(group)} disabled={saving}>
                                    Delete
                                  </button>
                                </div>
                              </td>
                            )}
                          </tr>
                        );
                      }) : items.map(item => (
                        <tr key={item.id}>
                          <td>
                            <div className={styles.itemIdentity}>
                              <div className={styles.texture}>
                                {item.texturePath ? <img src={item.texturePath} alt="" /> : <span>?</span>}
                              </div>
                              <div>
                                {item.recipeUrl
                                  ? <a className={styles.itemNameLink} href={item.recipeUrl} target="_blank" rel="noreferrer"><strong>{item.name}</strong></a>
                                  : <strong>{item.name}</strong>}
                                {item.exchange && (
                                  <span className={`${styles.exchangeRate} ${item.exchange.toggled ? '' : styles.exchangeDisabled}`}>
                                    {item.exchange.shells} {item.exchange.shells === 1 ? 'shell' : 'shells'} / {item.exchange.per}
                                  </span>
                                )}
                                {item.notes && <small>{item.notes}</small>}
                              </div>
                            </div>
                          </td>
                          {view !== 'archive' && (
                            <td className={styles.number}>{item.kind === 'ingredient' ? stackAmount(item.quantity) : item.quantity}</td>
                          )}
                          {view !== 'archive' && item.kind === 'consumable' && (
                            <td className={`${styles.number} ${styles.reserveNumber}`}>{item.reserveQuantity}</td>
                          )}
                          {view !== 'archive' && (
                            <td className={styles.number}>
                              {item.desiredQuantity === null ? '—' : item.kind === 'ingredient'
                                ? stackAmount(item.desiredQuantity)
                                : item.desiredQuantity}
                            </td>
                          )}
                          {item.kind === 'consumable' && <td>{item.usedBy || '—'}</td>}
                          <td>{item.bankPage || '—'}</td>
                          {view !== 'archive' && item.kind === 'consumable' && <td>{item.reserveBankPage || '—'}</td>}
                          {item.kind === 'consumable' && <td className={styles.number}>{item.charges ?? '—'}</td>}
                          {view !== 'archive' && (
                            <td>
                              {item.enough === null ? (
                                <span className={`${styles.badge} ${styles.neutralBadge}`}>No target</span>
                              ) : item.enough ? (
                                <span className={`${styles.badge} ${styles.goodBadge}`}><i /> Enough</span>
                              ) : (
                                <span className={`${styles.badge} ${styles.lowBadge}`}><i /> Not enough</span>
                              )}
                            </td>
                          )}
                          {canEdit && (
                            <td>
                              <div className={styles.rowActions}>
                                {!item.archived && <button onClick={() => void moveItem(item, -1)} aria-label={`Move ${item.name} up`}>↑</button>}
                                {!item.archived && <button onClick={() => void moveItem(item, 1)} aria-label={`Move ${item.name} down`}>↓</button>}
                                <button onClick={() => setDraft(itemDraft(item))}>Edit</button>
                                <button className={item.archived ? '' : styles.dangerText} onClick={() => void toggleArchive(item)} disabled={saving}>
                                  {item.archived ? 'Restore' : 'Archive'}
                                </button>
                                <button className={styles.dangerText} onClick={() => setDeleteItemDialog(item)} disabled={saving}>
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
              </section>
            );
          })}
        </div>
      )}

      {draft && (
        <div className={styles.modalBackdrop} role="presentation" onMouseDown={event => {
          if (event.currentTarget === event.target) setDraft(null);
        }}>
          <form className={styles.modal} onSubmit={saveItem}>
            <div className={styles.modalHeader}>
              <div>
                <span className={styles.eyebrow}>{draft.id ? 'Edit entry' : 'New entry'}</span>
                <h2>{draft.id ? draft.name : `Add ${draft.kind}`}</h2>
              </div>
              <button type="button" className={styles.closeButton} onClick={() => setDraft(null)} aria-label="Close">×</button>
            </div>
            <div className={styles.formGrid}>
              <label className={styles.fullField}>Name<input required value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
              <label>Category
                <select value={draft.categoryId} onChange={event => setDraft({ ...draft, categoryId: event.target.value })}>
                  {data.categories.filter(category => category.kind === draft.kind && !category.archived).map(category => (
                    <option key={category.id} value={category.id}>{category.name}</option>
                  ))}
                </select>
              </label>
              {draft.kind === 'consumable' && (
                <label>Storage area
                  <select value={draft.storageBucket} onChange={event => setDraft({ ...draft, storageBucket: event.target.value as Bucket })}>
                    <option value="account_bank">Account bank (Global Consu)</option>
                    <option value="character_bank">Character bank (Dry Consu / Bonus Consu)</option>
                  </select>
                </label>
              )}
              {!draft.archived && (
                <>
                  <label>Stock<input type="number" min="0" required value={draft.quantity} onChange={event => setDraft({ ...draft, quantity: event.target.value })} /></label>
                  {draft.kind === 'consumable' && (
                    <label>Reserve<input type="number" min="0" required value={draft.reserveQuantity} onChange={event => setDraft({ ...draft, reserveQuantity: event.target.value })} /></label>
                  )}
                  <label>Enough at<input type="number" min="0" value={draft.desiredQuantity} onChange={event => setDraft({ ...draft, desiredQuantity: event.target.value })} placeholder="No target" /></label>
                </>
              )}
              {draft.kind === 'consumable' && (
                <label>Used by<input value={draft.usedBy} onChange={event => setDraft({ ...draft, usedBy: event.target.value })} placeholder="DPS / Healer" /></label>
              )}
              {draft.kind !== 'material' && (
                <label>Location
                  <input
                    value={draft.bankPage}
                    onChange={event => setDraft({ ...draft, bankPage: event.target.value })}
                    placeholder={draft.kind === 'ingredient' ? 'e.g. B3 or IA5' : 'e.g. 7 or D4'}
                  />
                </label>
              )}
              {draft.kind === 'consumable' && (
                <>
                  <label>Reserve Location
                    <input
                      value={draft.reserveBankPage}
                      onChange={event => setDraft({ ...draft, reserveBankPage: event.target.value })}
                      placeholder="e.g. BA2"
                    />
                  </label>
                  <label>Charges<input type="number" min="0" value={draft.charges} onChange={event => setDraft({ ...draft, charges: event.target.value })} /></label>
                  <label>WynnCrafter link<input type="url" value={draft.recipeUrl} onChange={event => setDraft({ ...draft, recipeUrl: event.target.value })} /></label>
                </>
              )}
              <div className={`${styles.fullField} ${styles.textureChooser}`}>
                <span>Texture</span>
                <div>
                  <div className={styles.texturePreview}>
                    {draft.texturePath ? <img src={draft.texturePath} alt="" /> : <span>?</span>}
                  </div>
                  <button type="button" className={styles.secondaryButton} onClick={() => void openTextureLibrary()}>
                    Choose or upload PNG
                  </button>
                  {draft.texturePath && (
                    <button type="button" className={styles.textButton} onClick={() => setDraft({ ...draft, texturePath: '' })}>
                      Clear
                    </button>
                  )}
                </div>
                <input
                  aria-label="Texture path"
                  value={draft.texturePath}
                  onChange={event => setDraft({ ...draft, texturePath: event.target.value })}
                  placeholder="/inventory/…"
                />
              </div>
              <label>Scanner name<input value={draft.scanKey} onChange={event => setDraft({ ...draft, scanKey: event.target.value })} /></label>
              <label>Scanner aliases<input value={draft.aliases} onChange={event => setDraft({ ...draft, aliases: event.target.value })} placeholder="Comma-separated" /></label>
              <label className={styles.fullField}>Notes<textarea rows={3} value={draft.notes} onChange={event => setDraft({ ...draft, notes: event.target.value })} /></label>
            </div>
            <div className={styles.modalActions}>
              <button type="button" className={styles.secondaryButton} onClick={() => setDraft(null)}>Cancel</button>
              <button type="submit" className={styles.primaryButton} disabled={saving}>{saving ? 'Saving…' : 'Save entry'}</button>
            </div>
          </form>
        </div>
      )}

      {categoryDialog && (
        <div className={styles.modalBackdrop} role="presentation" onMouseDown={event => {
          if (event.currentTarget === event.target) setCategoryDialog(null);
        }}>
          <form className={`${styles.modal} ${styles.smallModal}`} onSubmit={saveCategory}>
            <div className={styles.modalHeader}>
              <h2>{categoryDialog.id ? 'Rename category' : `Add ${categoryDialog.kind} category`}</h2>
              <button type="button" className={styles.closeButton} onClick={() => setCategoryDialog(null)} aria-label="Close">×</button>
            </div>
            <label>Category name
              <input autoFocus required value={categoryDialog.name} onChange={event => setCategoryDialog({ ...categoryDialog, name: event.target.value })} />
            </label>
            <div className={styles.modalActions}>
              <button type="button" className={styles.secondaryButton} onClick={() => setCategoryDialog(null)}>Cancel</button>
              <button type="submit" className={styles.primaryButton} disabled={saving}>Save category</button>
            </div>
          </form>
        </div>
      )}

      {deleteCategoryDialog && (
        <div className={styles.modalBackdrop} role="presentation" onMouseDown={event => {
          if (event.currentTarget === event.target) setDeleteCategoryDialog(null);
        }}>
          <form className={`${styles.modal} ${styles.smallModal}`} onSubmit={deleteCategory}>
            <div className={styles.modalHeader}>
              <div>
                <span className={styles.eyebrow}>Delete category</span>
                <h2>{deleteCategoryDialog.category.name}</h2>
              </div>
              <button type="button" className={styles.closeButton} onClick={() => setDeleteCategoryDialog(null)} aria-label="Close">×</button>
            </div>
            {data.items.some(item => item.categoryId === deleteCategoryDialog.category.id) ? (
              <label>Move its entries to
                <select
                  required
                  value={deleteCategoryDialog.replacementId}
                  onChange={event => setDeleteCategoryDialog({ ...deleteCategoryDialog, replacementId: event.target.value })}
                >
                  <option value="">Choose a category</option>
                  {data.categories.filter(category => (
                    category.kind === deleteCategoryDialog.category.kind
                    && category.id !== deleteCategoryDialog.category.id
                    && !category.archived
                  )).map(category => (
                    <option key={category.id} value={category.id}>{category.name}</option>
                  ))}
                </select>
              </label>
            ) : (
              <p className={styles.modalCopy}>This empty category will be permanently removed.</p>
            )}
            <div className={styles.modalActions}>
              <button type="button" className={styles.secondaryButton} onClick={() => setDeleteCategoryDialog(null)}>Cancel</button>
              <button type="submit" className={styles.dangerButton} disabled={saving}>Delete category</button>
            </div>
          </form>
        </div>
      )}

      {deleteItemDialog && (
        <div className={styles.modalBackdrop} role="presentation" onMouseDown={event => {
          if (event.currentTarget === event.target) setDeleteItemDialog(null);
        }}>
          <form className={`${styles.modal} ${styles.smallModal}`} onSubmit={deleteItem}>
            <div className={styles.modalHeader}>
              <div>
                <span className={styles.eyebrow}>Delete entry</span>
                <h2>{deleteItemDialog.name}</h2>
              </div>
              <button type="button" className={styles.closeButton} onClick={() => setDeleteItemDialog(null)} aria-label="Close">×</button>
            </div>
            <p className={styles.modalCopy}>
              This permanently removes {deleteItemDialog.name} and its scan history matching, unlike Archive this cannot be undone.
              Use Archive instead if you just want to hide it from the active list.
            </p>
            <div className={styles.modalActions}>
              <button type="button" className={styles.secondaryButton} onClick={() => setDeleteItemDialog(null)}>Cancel</button>
              <button type="submit" className={styles.dangerButton} disabled={saving}>Delete permanently</button>
            </div>
          </form>
        </div>
      )}

      {materialGroupDialog && (
        <div className={styles.modalBackdrop} role="presentation" onMouseDown={event => {
          if (event.currentTarget === event.target) setMaterialGroupDialog(null);
        }}>
          <form className={`${styles.modal} ${styles.smallModal}`} onSubmit={saveMaterialGroup}>
            <div className={styles.modalHeader}>
              <h2>{materialGroupDialog.baseName}</h2>
              <button type="button" className={styles.closeButton} onClick={() => setMaterialGroupDialog(null)} aria-label="Close">×</button>
            </div>
            <div className={styles.formGrid}>
              {materialGroupDialog.tiers.map((tier, index) => (
                <Fragment key={tier.id}>
                  <label style={{ '--tier-color': TIER_COLORS[tier.tier] } as CSSProperties}>
                    <span className={styles.tierLabel}>T{tier.tier} stock</span>
                    <input
                      type="number"
                      min="0"
                      required
                      value={tier.quantity}
                      onChange={event => updateMaterialTier(index, 'quantity', event.target.value)}
                    />
                  </label>
                  <label style={{ '--tier-color': TIER_COLORS[tier.tier] } as CSSProperties}>
                    <span className={styles.tierLabel}>T{tier.tier} target</span>
                    <input
                      type="number"
                      min="0"
                      value={tier.desiredQuantity}
                      onChange={event => updateMaterialTier(index, 'desiredQuantity', event.target.value)}
                      placeholder="No target"
                    />
                  </label>
                  <label style={{ '--tier-color': TIER_COLORS[tier.tier] } as CSSProperties}>
                    <span className={styles.tierLabel}>T{tier.tier} Location</span>
                    <input
                      value={tier.bankPage}
                      onChange={event => updateMaterialTier(index, 'bankPage', event.target.value)}
                      placeholder="e.g. M4"
                    />
                  </label>
                </Fragment>
              ))}
            </div>
            <div className={styles.modalActions}>
              <button type="button" className={styles.secondaryButton} onClick={() => setMaterialGroupDialog(null)}>Cancel</button>
              <button type="submit" className={styles.primaryButton} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        </div>
      )}

      {deleteMaterialGroupDialog && (
        <div className={styles.modalBackdrop} role="presentation" onMouseDown={event => {
          if (event.currentTarget === event.target) setDeleteMaterialGroupDialog(null);
        }}>
          <form className={`${styles.modal} ${styles.smallModal}`} onSubmit={deleteMaterialGroup}>
            <div className={styles.modalHeader}>
              <div>
                <span className={styles.eyebrow}>Delete material</span>
                <h2>{deleteMaterialGroupDialog.baseName}</h2>
              </div>
              <button type="button" className={styles.closeButton} onClick={() => setDeleteMaterialGroupDialog(null)} aria-label="Close">×</button>
            </div>
            <p className={styles.modalCopy}>
              This permanently removes all three tiers of {deleteMaterialGroupDialog.baseName}, unlike Archive this cannot be undone.
            </p>
            <div className={styles.modalActions}>
              <button type="button" className={styles.secondaryButton} onClick={() => setDeleteMaterialGroupDialog(null)}>Cancel</button>
              <button type="submit" className={styles.dangerButton} disabled={saving}>Delete permanently</button>
            </div>
          </form>
        </div>
      )}

      {scanProfileDialog && (
        <div className={styles.modalBackdrop} role="presentation" onMouseDown={event => {
          if (event.currentTarget === event.target) setScanProfileDialog(null);
        }}>
          <form className={`${styles.modal} ${styles.smallModal}`} onSubmit={saveScanProfile}>
            <div className={styles.modalHeader}>
              <h2>{scanProfileDialog.id ? 'Edit scan profile' : 'Add scan profile'}</h2>
              <button type="button" className={styles.closeButton} onClick={() => setScanProfileDialog(null)} aria-label="Close">×</button>
            </div>
            <div className={styles.formGrid}>
              <label>Character nickname
                <input
                  autoFocus
                  required
                  value={scanProfileDialog.nickname}
                  onChange={event => setScanProfileDialog({ ...scanProfileDialog, nickname: event.target.value })}
                  placeholder="Bonus Consu 4"
                />
              </label>
              <label>Scans as (display name)
                <input
                  required
                  value={scanProfileDialog.displayName}
                  onChange={event => setScanProfileDialog({ ...scanProfileDialog, displayName: event.target.value })}
                />
              </label>
              <label>Content type
                <select
                  disabled={Boolean(scanProfileDialog.id)}
                  value={scanProfileDialog.contentType}
                  onChange={event => setScanProfileDialog({ ...scanProfileDialog, contentType: event.target.value as 'consumables' | 'ingredients' | 'materials' })}
                >
                  <option value="consumables">Consumables</option>
                  <option value="ingredients">Ingredients</option>
                  <option value="materials">Materials</option>
                </select>
              </label>
              <label>Start page<input type="number" min="1" required value={scanProfileDialog.startPage} onChange={event => setScanProfileDialog({ ...scanProfileDialog, startPage: event.target.value })} /></label>
              <label>Total pages<input type="number" min="1" required value={scanProfileDialog.totalPages} onChange={event => setScanProfileDialog({ ...scanProfileDialog, totalPages: event.target.value })} /></label>
              <label>Location prefix
                <input
                  value={scanProfileDialog.locationPrefix}
                  onChange={event => setScanProfileDialog({ ...scanProfileDialog, locationPrefix: event.target.value })}
                  placeholder="e.g. D, BA, IA, M"
                />
              </label>
              {scanProfileDialog.id && (
                <label className={styles.checkboxField}>
                  <input
                    type="checkbox"
                    checked={scanProfileDialog.archived}
                    onChange={event => setScanProfileDialog({ ...scanProfileDialog, archived: event.target.checked })}
                  />
                  Archived (mod stops offering this scan)
                </label>
              )}
            </div>
            <div className={styles.modalActions}>
              <button type="button" className={styles.secondaryButton} onClick={() => setScanProfileDialog(null)}>Cancel</button>
              <button type="submit" className={styles.primaryButton} disabled={saving}>Save profile</button>
            </div>
          </form>
        </div>
      )}

      {deleteScanProfileDialog && (
        <div className={styles.modalBackdrop} role="presentation" onMouseDown={event => {
          if (event.currentTarget === event.target) setDeleteScanProfileDialog(null);
        }}>
          <form className={`${styles.modal} ${styles.smallModal}`} onSubmit={deleteScanProfile}>
            <div className={styles.modalHeader}>
              <div>
                <span className={styles.eyebrow}>Delete scan profile</span>
                <h2>{deleteScanProfileDialog.nickname}</h2>
              </div>
              <button type="button" className={styles.closeButton} onClick={() => setDeleteScanProfileDialog(null)} aria-label="Close">×</button>
            </div>
            <p className={styles.modalCopy}>
              The mod will stop recognizing this character nickname as a scannable bank. Consider archiving instead if this character might come back.
            </p>
            <div className={styles.modalActions}>
              <button type="button" className={styles.secondaryButton} onClick={() => setDeleteScanProfileDialog(null)}>Cancel</button>
              <button type="submit" className={styles.dangerButton} disabled={saving}>Delete profile</button>
            </div>
          </form>
        </div>
      )}

      {textureDialog && draft && (
        <div className={`${styles.modalBackdrop} ${styles.textureBackdrop}`} role="presentation" onMouseDown={event => {
          if (event.currentTarget === event.target) setTextureDialog(false);
        }}>
          <section className={`${styles.modal} ${styles.textureModal}`} role="dialog" aria-modal="true" aria-label="Texture library">
            <div className={styles.modalHeader}>
              <div>
                <span className={styles.eyebrow}>Texture library</span>
                <h2>Choose artwork</h2>
              </div>
              <button type="button" className={styles.closeButton} onClick={() => setTextureDialog(false)} aria-label="Close">×</button>
            </div>
            <div className={styles.textureToolbar}>
              <input
                autoFocus
                value={textureSearch}
                onChange={event => setTextureSearch(event.target.value)}
                placeholder="Search existing PNGs…"
              />
              <label className={styles.uploadButton}>
                Upload PNG
                <input
                  type="file"
                  accept="image/png"
                  disabled={textureLoading}
                  onChange={event => void uploadTexture(event.target.files?.[0] ?? null)}
                />
              </label>
            </div>
            {textureLoading ? (
              <div className={styles.textureLoading}>Loading textures…</div>
            ) : (
              <div className={styles.textureGrid}>
                {textureLibrary
                  .filter(asset => {
                    const rightKind = asset.kind === 'custom'
                      || asset.kind === 'unassigned'
                      || asset.kind === draft.kind
                      || (draft.kind === 'ingredient' && asset.kind === 'material');
                    return rightKind && asset.name.toLocaleLowerCase('en-US').includes(textureSearch.trim().toLocaleLowerCase('en-US'));
                  })
                  .map(asset => (
                    <button
                      type="button"
                      key={asset.id}
                      className={draft.texturePath === asset.url ? styles.selectedTexture : ''}
                      onClick={() => {
                        setDraft({ ...draft, texturePath: asset.url });
                        setTextureDialog(false);
                      }}
                    >
                      <img src={asset.url} alt="" />
                      <span>{asset.name}</span>
                      <small>{asset.kind === 'unassigned' ? 'Unassigned' : asset.source === 'shell-exchange' ? 'Shell Exchange' : asset.source === 'uploaded' ? 'Uploaded' : 'Inventory'}</small>
                    </button>
                  ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
