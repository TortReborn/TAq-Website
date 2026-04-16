import useSWR from 'swr';
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
  const { data, error, isLoading, mutate } = useSWR<TrackerData>(
    `/api/exec/requests${qs}`,
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
    refresh: () => mutate(),
    createTicket,
    updateTicketLocally,
  };
}
