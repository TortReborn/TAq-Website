"use client";

import { useEffect, useRef, useState } from 'react';

const ACCEPT = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

/** Screenshot picker: click, drag-and-drop, or paste. Most proof is copied out of Discord. */
export default function ScreenshotDrop({ files, onChange, max = 10 }: {
  files: File[];
  onChange: (files: File[]) => void;
  max?: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [previews, setPreviews] = useState<string[]>([]);

  useEffect(() => {
    const urls = files.map(f => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach(u => URL.revokeObjectURL(u));
  }, [files]);

  const add = (incoming: File[]) => {
    const images = incoming.filter(f => ACCEPT.includes(f.type));
    if (images.length) onChange([...files, ...images].slice(0, max));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <div
        tabIndex={0}
        role="button"
        aria-label="Add screenshots: click, drop, or paste"
        onClick={() => inputRef.current?.click()}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click(); } }}
        onPaste={e => {
          const pasted = Array.from(e.clipboardData?.items ?? [])
            .filter(i => i.type.startsWith('image/'))
            .map(i => i.getAsFile())
            .filter((f): f is File => !!f);
          if (pasted.length) { e.preventDefault(); add(pasted); }
        }}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); add(Array.from(e.dataTransfer.files)); }}
        style={{
          border: `1px dashed ${dragging ? 'var(--color-ocean-400)' : 'var(--border-card)'}`,
          borderRadius: '0.5rem', padding: '1rem', textAlign: 'center', cursor: 'pointer',
          color: 'var(--text-secondary)', fontSize: '0.8rem', background: 'var(--bg-primary)',
        }}
      >
        Drop, paste (Ctrl+V after clicking here) or click to choose screenshots
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT.join(',')}
          multiple
          hidden
          onChange={e => { add(Array.from(e.target.files ?? [])); e.target.value = ''; }}
        />
      </div>
      {files.length > 0 && (
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {previews.map((src, i) => (
            <div key={src} style={{ position: 'relative' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt={files[i]?.name ?? ''} style={{ width: 80, height: 56, objectFit: 'cover', borderRadius: '0.25rem', border: '1px solid var(--border-card)' }} />
              <button
                type="button"
                aria-label={`Remove ${files[i]?.name ?? 'screenshot'}`}
                onClick={() => onChange(files.filter((_, j) => j !== i))}
                style={{
                  position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: 10,
                  border: 'none', background: '#ef4444', color: '#fff', fontSize: '0.7rem', cursor: 'pointer', lineHeight: '20px',
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
