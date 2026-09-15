import useSWR, { mutate as mutateKey } from 'swr';
import { fetcher } from './fetcher';

export type TicketType = 'bug' | 'feature';
export type TicketSystem = 'discord_bot' | 'minecraft_mod' | 'website';
export type TicketStatus = 'untriaged' | 'todo' | 'blocked' | 'in_progress' | 'deployed' | 'declined' | 'archived';
export type TicketPriority = 'low' | 'medium' | 'high' | 'critical';

export interface Ticket {
  id: number;
  type: TicketType;
  system: TicketSystem[];
  title: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  submittedBy: string;
  submittedByIgn: string | null;
  assignedTo: string | null;
  assignedToIgn: string | null;
  commentCount: number;
  position: number;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

export interface ExecMember {
  discordId: string;
  ign: string;
}

export interface TrackerFilters {
  status?: string;
  type?: string;
  system?: string;
  priority?: string;
  q?: string;
  sort?: string;
  order?: 'asc' | 'desc';
}

interface TrackerData {
  tickets: Ticket[];
  execMembers: ExecMember[];
}

function buildQueryString(filters: TrackerFilters): string {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.type) params.set('type', filters.type);
  if (filters.system) params.set('system', filters.system);
  if (filters.priority) params.set('priority', filters.priority);
  if (filters.q) params.set('q', filters.q);
  if (filters.sort) params.set('sort', filters.sort);
  if (filters.order) params.set('order', filters.order);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function useExecTracker(filters: TrackerFilters = {}) {
  const qs = buildQueryString(filters);
  const key = `/api/exec/requests${qs}`;
  const { data, error, isLoading, mutate } = useSWR<TrackerData>(
    key,
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 30000, dedupingInterval: 10000 }
  );

  const createTicket = async (input: {
    type: TicketType;
    system: TicketSystem[];
    title: string;
    description: string;
    priority?: TicketPriority;
  }): Promise<number> => {
    const res = await fetch('/api/exec/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const data = await res.json();
    mutate();
    return data.id;
  };

  /**
   * Move a card (drag/drop or the detail panel's status select). Runs as an
   * SWR async mutation: the optimistic list shows at once, any background
   * revalidation that overlaps the write is discarded instead of putting
   * the card back, and the cache is populated from a fresh fetch only after
   * the write has committed. The detail panel's own cache is refreshed too
   * so its status select agrees with the column.
   */
  const moveTicket = async (id: number, status: TicketStatus, position: number) => {
    const optimistic = data
      ? { ...data, tickets: data.tickets.map(t => t.id === id ? { ...t, status } : t) }
      : undefined;
    await mutate(
      async () => {
        const res = await fetch('/api/exec/requests/reorder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticketId: id, status, position }),
        });
        if (!res.ok) throw new Error(`Move failed (HTTP ${res.status})`);
        return fetcher(key) as Promise<TrackerData>;
      },
      { optimisticData: optimistic, rollbackOnError: true, populateCache: true, revalidate: false },
    );
    mutateKey(`/api/exec/requests/${id}`);
  };

  const updateTicketLocally = (id: number, fields: Partial<Ticket>) => {
    if (!data) return;
    mutate(
      {
        ...data,
        tickets: data.tickets.map(t => t.id === id ? { ...t, ...fields } : t),
      },
      false,
    );
  };

  return {
    tickets: data?.tickets ?? [],
    execMembers: data?.execMembers ?? [],
    loading: isLoading,
    error: error?.message ?? null,
    // A promise as the mutation, not a bare revalidate: a bare mutate() reuses
    // any in-flight background fetch, which may predate the write we just made.
    refresh: () => mutate(fetcher(key) as Promise<TrackerData>, { revalidate: false }),
    createTicket,
    moveTicket,
    updateTicketLocally,
  };
}
