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

export interface TicketAttachment {
  id: number;
  filename: string;
  contentType: string;
  sizeBytes: number;
  uploadedBy: string;
  createdAt: string;
}

interface TicketDetailData {
  ticket: Ticket;
  comments: TicketComment[];
  attachments: TicketAttachment[];
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
    due_date?: string | null;
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

  const uploadAttachments = async (files: File[]) => {
    if (!id || files.length === 0) return;
    const formData = new FormData();
    for (const file of files) {
      formData.append('files', file);
    }
    await fetch(`/api/exec/requests/${id}/attachments`, {
      method: 'POST',
      body: formData,
    });
    mutate();
  };

  const deleteAttachment = async (attachmentId: number) => {
    if (!id) return;
    await fetch(`/api/exec/requests/${id}/attachments/${attachmentId}`, {
      method: 'DELETE',
    });
    mutate();
  };

  return {
    ticket: data?.ticket ?? null,
    comments: data?.comments ?? [],
    attachments: data?.attachments ?? [],
    loading: isLoading,
    error: error?.message ?? null,
    refresh: () => mutate(),
    updateTicket,
    deleteTicket,
    addComment,
    uploadAttachments,
    deleteAttachment,
  };
}
