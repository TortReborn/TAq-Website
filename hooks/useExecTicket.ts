import useSWR from 'swr';
import { fetcher } from './fetcher';
import type { Ticket } from './useExecTracker';

export interface TicketComment {
  id: number;
  authorId: string;
  authorIgn: string | null;
  body: string;
  createdAt: string;
}

interface TicketDetailData {
  ticket: Ticket;
  comments: TicketComment[];
}

export function useExecTicket(id: number | null) {
  const { data, error, isLoading, mutate } = useSWR<TicketDetailData>(
    id ? `/api/exec/requests/${id}` : null,
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 15000, dedupingInterval: 5000 }
  );

  const updateTicket = async (fields: {
    status?: string;
    priority?: string;
    assigned_to?: string | null;
    title?: string;
    description?: string;
    type?: string;
    system?: string[];
  }) => {
    if (!id) return;
    await fetch(`/api/exec/requests/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    });
    mutate();
  };

  const deleteTicket = async () => {
    if (!id) return;
    await fetch(`/api/exec/requests/${id}`, {
      method: 'DELETE',
    });
    mutate();
  };

  const addComment = async (body: string) => {
    if (!id) return;
    await fetch(`/api/exec/requests/${id}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    });
    mutate();
  };

  return {
    ticket: data?.ticket ?? null,
    comments: data?.comments ?? [],
    loading: isLoading,
    error: error?.message ?? null,
    refresh: () => mutate(),
    updateTicket,
    deleteTicket,
    addComment,
  };
}
