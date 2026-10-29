import useSWR from 'swr';
import { fetcher } from './fetcher';
import { compressImageInBrowser } from '@/lib/compress-image-client';
import type { WarningKind, WarningProfile, WarningProfileSummary } from '@/lib/warnings';

async function send(url: string, method: string, body: unknown, fallback: string) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || fallback);
  return data;
}

/** Add an entry, then upload its screenshots one at a time (keeps each request under the body cap). */
export async function addWarning(
  input: { ign: string; kind: WarningKind; rule: string; notes: string },
  files: File[],
): Promise<{ uuid: string; failedUploads: string[] }> {
  const created = await send('/api/exec/warnings', 'POST', input, 'Failed to add warning');
  const failedUploads: string[] = [];
  for (const file of files) {
    try {
      await uploadWarningAttachment(created.id, file);
    } catch {
      failedUploads.push(file.name);
    }
  }
  return { uuid: created.uuid, failedUploads };
}

export async function uploadWarningAttachment(warningId: number, file: File) {
  const { file: toSend } = await compressImageInBrowser(file);
  const form = new FormData();
  form.append('files', toSend);
  const res = await fetch(`/api/exec/warnings/entries/${warningId}/attachments`, { method: 'POST', body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to upload screenshot');
}

export function useExecWarnings() {
  const { data, error, isLoading, mutate } = useSWR<{ profiles: WarningProfileSummary[] }>(
    '/api/exec/warnings',
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 60000, dedupingInterval: 10000 }
  );

  return {
    profiles: data?.profiles ?? [],
    loading: isLoading,
    error: error?.message ?? null,
    refresh: () => mutate(),
  };
}

export function useWarningProfile(uuid: string | undefined) {
  const { data, error, isLoading, mutate } = useSWR<{ profile: WarningProfile }>(
    uuid ? `/api/exec/warnings/${uuid}` : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 10000 }
  );

  const revoke = async (id: number, reason: string) => {
    await send(`/api/exec/warnings/entries/${id}`, 'PATCH', { action: 'revoke', reason }, 'Failed to revoke');
    mutate();
  };

  const restore = async (id: number) => {
    await send(`/api/exec/warnings/entries/${id}`, 'PATCH', { action: 'restore' }, 'Failed to restore');
    mutate();
  };

  const updateNotes = async (id: number, notes: string) => {
    await send(`/api/exec/warnings/entries/${id}`, 'PATCH', { notes }, 'Failed to save notes');
    mutate();
  };

  const setDiscordId = async (discordId: string | null) => {
    await send(`/api/exec/warnings/${uuid}`, 'PATCH', { discordId }, 'Failed to save the Discord account');
    mutate();
  };

  const addScreenshots = async (id: number, files: File[]) => {
    for (const file of files) await uploadWarningAttachment(id, file);
    mutate();
  };

  return {
    profile: data?.profile ?? null,
    loading: isLoading,
    error: error?.message ?? null,
    refresh: () => mutate(),
    revoke,
    restore,
    updateNotes,
    addScreenshots,
    setDiscordId,
  };
}

export async function searchWarningPlayers(q: string): Promise<string[]> {
  const res = await fetch(`/api/exec/warnings/players?q=${encodeURIComponent(q)}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.players ?? [];
}
