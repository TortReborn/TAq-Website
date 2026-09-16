'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { fetcher } from '@/hooks/fetcher';
import SkinViewer3D from '@/components/SkinViewer3D';
import type { ArmModel, UniformVariant } from '@/lib/uniform';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

interface UniformInfo {
  ign: string;
  model: ArmModel;
  detectedModel: ArmModel;
  guildRank: string | null;
  defaultVariant: UniformVariant;
  links: Record<UniformVariant, string>;
}

const VARIANT_LABELS: Record<UniformVariant, string> = {
  'recruit-captain': 'Recruit – Strategist',
  chief: 'Chief',
};

const VIEWER_WIDTH = 300;
const VIEWER_HEIGHT = 360;

/**
 * minecraft.net's current skin editor. It takes no parameters — the old
 * profile/skin/remote?url= deep link now redirects to the profile page and
 * drops the url on the way — so the flow is download, then upload there.
 */
const MINECRAFT_SKIN_EDITOR = 'https://www.minecraft.net/en-us/msaprofile/mygames/editskin';

/**
 * TAQ-89: "Wear the uniform". Shows the member their own skin with the
 * guild uniform composited on, and gives them the PNG to upload at
 * minecraft.net or in the launcher.
 */
export default function UniformModal({ isOpen, onClose }: Props) {
  const [modelOverride, setModelOverride] = useState<ArmModel | null>(null);
  const query = modelOverride ? `?model=${modelOverride}` : '';
  const { data, error, isLoading } = useSWR<UniformInfo>(
    isOpen ? `/api/profile/uniform${query}` : null,
    fetcher,
    { revalidateOnFocus: false, shouldRetryOnError: false },
  );

  const [variant, setVariant] = useState<UniformVariant | null>(null);
  const activeVariant = variant ?? data?.defaultVariant ?? 'recruit-captain';
  const pngUrl = data?.links[activeVariant] ?? null;

  const [previewState, setPreviewState] = useState<'idle' | 'loading' | 'ready' | 'failed'>('idle');

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    if (isOpen) window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  // Reset choices when reopened so the modal always starts from the member's own tier.
  useEffect(() => {
    if (!isOpen) { setVariant(null); setModelOverride(null); setPreviewState('idle'); }
  }, [isOpen]);

  if (!isOpen) return null;

  const errorMessage = error ? error.message.replace(/^HTTP \d+: /, '') : null;

  return (
    <div className="bg-shop-overlay" onClick={onClose}>
      <div className="bg-shop-modal uniform-modal" onClick={e => e.stopPropagation()}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1rem',
          paddingBottom: '0.75rem',
          borderBottom: '1px solid var(--border-card)',
        }}>
          <h2 style={{
            margin: 0,
            fontFamily: "'MinecraftFont', monospace",
            fontSize: '1.1rem',
            color: 'var(--text-primary)',
            letterSpacing: '0.5px',
          }}>
            Wear the uniform
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '1.5rem', cursor: 'pointer', padding: '0 0.25rem', lineHeight: 1 }}
          >
            &times;
          </button>
        </div>

        {isLoading && (
          <div className="uniform-status">Fetching your current skin from Mojang...</div>
        )}

        {errorMessage && !isLoading && (
          <div className="uniform-status" style={{ color: '#fca5a5' }}>{errorMessage}</div>
        )}

        {data && !isLoading && (
          <>
            <p className="uniform-blurb">
              Your own head and hands, the guild&apos;s uniform on the rest. Nothing changes
              until you upload it.
            </p>

            <div className="uniform-preview" style={{ opacity: previewState === 'ready' ? 1 : 0.4 }}>
              <SkinViewer3D
                skinUrl={pngUrl}
                model={data.model}
                width={VIEWER_WIDTH}
                height={VIEWER_HEIGHT}
                onStateChange={setPreviewState}
              />
              <span className="uniform-preview-hint">drag to spin · scroll to zoom</span>
            </div>
            {previewState === 'failed' && (
              <div className="uniform-status" style={{ color: '#fca5a5', padding: '0.25rem 0 0.75rem' }}>
                Could not build the preview. The download below may still work.
              </div>
            )}

            <div className="uniform-options">
              <div className="uniform-option-row">
                <span className="uniform-option-label">Uniform</span>
                <div className="uniform-segment">
                  {(Object.keys(VARIANT_LABELS) as UniformVariant[]).map(v => (
                    <button
                      key={v}
                      className={activeVariant === v ? 'active' : ''}
                      onClick={() => setVariant(v)}
                    >
                      {VARIANT_LABELS[v]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="uniform-option-row">
                <span className="uniform-option-label">Arms</span>
                <div className="uniform-segment">
                  {(['classic', 'slim'] as ArmModel[]).map(m => (
                    <button
                      key={m}
                      className={data.model === m ? 'active' : ''}
                      onClick={() => setModelOverride(m === data.detectedModel ? null : m)}
                    >
                      {m === 'classic' ? 'Classic (4px)' : 'Slim (3px)'}
                    </button>
                  ))}
                </div>
                <span className="uniform-option-hint">
                  {data.model === data.detectedModel ? 'as detected from your skin' : `Mojang says ${data.detectedModel}`}
                </span>
              </div>
            </div>

            <div className="uniform-actions">
              <a
                className="bg-shop-btn bg-shop-btn-set uniform-btn"
                href={pngUrl ?? '#'}
                download={`taq-uniform-${data.ign}.png`}
                aria-disabled={!pngUrl}
              >
                Download skin
              </a>
              <a
                className="bg-shop-btn bg-shop-btn-cancel uniform-btn"
                href={MINECRAFT_SKIN_EDITOR}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open minecraft.net skin editor
              </a>
            </div>
            <p className="uniform-footnote">
              Upload the downloaded PNG at minecraft.net (or the launcher&apos;s Skins tab) and pick
              the same arm model there. Capes are separate.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
