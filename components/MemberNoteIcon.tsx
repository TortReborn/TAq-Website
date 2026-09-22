"use client";

import { useRef, useState } from 'react';
import { StickyNote } from 'lucide-react';
import MemberNoteEditor from './MemberNoteEditor';
import type { MemberNote } from '@/hooks/useMemberNotes';

interface MemberNoteIconProps {
  uuid: string;
  username: string;
  note: MemberNote;
  onSave: (uuid: string, note: string) => Promise<void>;
  onDelete: (uuid: string) => Promise<void>;
}

interface TooltipPos {
  left: number;
  top: number;
  placement: 'above' | 'below';
}

export default function MemberNoteIcon({ uuid, username, note, onSave, onDelete }: MemberNoteIconProps) {
  const [editing, setEditing] = useState(false);
  const [tooltip, setTooltip] = useState<TooltipPos | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleShow = () => {
    if (showTimer.current) clearTimeout(showTimer.current);
    showTimer.current = setTimeout(() => {
      const rect = btnRef.current?.getBoundingClientRect();
      if (!rect) return;
      const placement = rect.top > 160 ? 'above' : 'below';
      setTooltip({
        left: rect.left + rect.width / 2,
        top: placement === 'above' ? rect.top - 8 : rect.bottom + 8,
        placement,
      });
    }, 150);
  };

  const hideTooltip = () => {
    if (showTimer.current) clearTimeout(showTimer.current);
    setTooltip(null);
  };

  return (
    <>
      <button
        ref={btnRef}
        onMouseEnter={scheduleShow}
        onMouseLeave={hideTooltip}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); hideTooltip(); setEditing(true); }}
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: '20px', height: '20px', flexShrink: 0,
          border: 'none', background: 'transparent', padding: 0, cursor: 'pointer',
          color: 'var(--color-ocean-400)',
        }}
      >
        <StickyNote size={14} strokeWidth={2} fill="currentColor" fillOpacity={0.15} />
      </button>

      {tooltip && (
        <div
          role="tooltip"
          style={{
            position: 'fixed',
            left: tooltip.left,
            top: tooltip.top,
            transform: `translate(-50%, ${tooltip.placement === 'above' ? '-100%' : '0'})`,
            zIndex: 2000,
            pointerEvents: 'none',
          }}
        >
          <div style={{
            background: 'var(--bg-card-solid)',
            border: '1px solid var(--border-card)',
            borderRadius: '0.5rem',
            boxShadow: '0 12px 32px rgba(0, 0, 0, 0.35)',
            padding: '0.65rem 0.8rem',
            maxWidth: '260px',
            fontSize: '0.78rem',
            lineHeight: 1.5,
            color: 'var(--text-primary)',
            whiteSpace: 'pre-wrap',
          }}>
            {note.note}
          </div>
          <div style={{
            position: 'absolute', left: '50%', transform: 'translateX(-50%)',
            width: 0, height: 0,
            borderLeft: '6px solid transparent', borderRight: '6px solid transparent',
            ...(tooltip.placement === 'above'
              ? { top: '100%', borderTop: '6px solid var(--bg-card-solid)' }
              : { bottom: '100%', borderBottom: '6px solid var(--bg-card-solid)' }),
          }} />
        </div>
      )}

      {editing && (
        <MemberNoteEditor
          username={username}
          initialNote={note.note}
          onClose={() => setEditing(false)}
          onSave={(text) => onSave(uuid, text)}
          onDelete={() => onDelete(uuid)}
        />
      )}
    </>
  );
}
