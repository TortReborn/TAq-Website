"use client";

import React, { useEffect, useRef, useState } from 'react';
import { getImageForItem, raidImageMap, classImageMap, isWard, getWardImage, getWardColor } from '@/lib/lootpool-images';
import { getClassForAspect } from '@/lib/aspect-class-map';
import Image from 'next/image';
import PageHeader from '@/components/PageHeader';
import { useLootruns, useAspects } from '@/hooks/useLootpools';
import LootpoolSkeleton from '@/components/skeletons/LootpoolSkeleton';
import {
  LOOT_RESET_WEEKDAY_UTC,
  LOOT_RESET_HOUR_UTC,
  RAID_RESET_WEEKDAY_UTC,
  RAID_RESET_HOUR_UTC,
  nextWeeklyReset,
  formatCountdown,
} from '@/lib/lootpool-reset';

interface LootRegion {
  Mythic?: string[];
  Fabled?: string[];
  Legendary?: string[];
  Rare?: string[];
  Unique?: string[];
  Shiny?: {
    Item: string;
    Tracker: string;
  };
}

interface LootData {
  Timestamp: number;
  Icon?: { [itemName: string]: string };
  Loot?: { [region: string]: LootRegion };
  Aspects?: { [raid: string]: LootRegion };
  Items?: { [region: string]: LootRegion };
}

type LootpoolTab = 'lootruns' | 'raids';

export default function LootpoolsPage() {
  const [activeTab, setActiveTab] = useState<LootpoolTab>('lootruns');
  const [exitingTab, setExitingTab] = useState<LootpoolTab | null>(null);
  const transitionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { data: lootrunsData, loading: lootrunsLoading, error: lootrunsError } = useLootruns();
  const { data: aspectsData, loading: aspectsLoading, error: aspectsError } = useAspects();

  const loading = lootrunsLoading || aspectsLoading;
  const error = lootrunsError || aspectsError;

  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    return () => {
      if (transitionTimeoutRef.current) {
        clearTimeout(transitionTimeoutRef.current);
      }
    };
  }, []);

  const switchTab = (tab: LootpoolTab) => {
    if (tab === activeTab) {
      return;
    }

    if (transitionTimeoutRef.current) {
      clearTimeout(transitionTimeoutRef.current);
    }

    setExitingTab(activeTab);
    setActiveTab(tab);
    transitionTimeoutRef.current = setTimeout(() => {
      setExitingTab(null);
      transitionTimeoutRef.current = null;
    }, 320);
  };

  const renderTabContent = (tab: LootpoolTab) => {
    if (tab === 'lootruns') {
      return lootrunsData ? <LootrunsView data={lootrunsData} /> : null;
    }

    return aspectsData ? <RaidsView data={aspectsData} /> : null;
  };

  if (loading) {
    return <LootpoolSkeleton />;
  }

  if (error) {
    return (
      <div style={{
        padding: '2rem',
        textAlign: 'center',
        minHeight: '50vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div style={{
          fontSize: '1.125rem',
          color: '#ef4444',
          background: 'var(--bg-card)',
          padding: '1.5rem',
          borderRadius: '0.5rem',
          border: '1px solid #ef4444'
        }}>
          {error}
        </div>
      </div>
    );
  }

  const resetTarget = activeTab === 'lootruns'
    ? nextWeeklyReset(LOOT_RESET_WEEKDAY_UTC, LOOT_RESET_HOUR_UTC, now)
    : nextWeeklyReset(RAID_RESET_WEEKDAY_UTC, RAID_RESET_HOUR_UTC, now);
  const nextRotation = formatCountdown(resetTarget, now);

  return (
    <div style={{
      padding: '2rem',
      margin: '0 auto',
      minHeight: '100vh'
    }}>
      {/* Header Container */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        marginBottom: '3rem'
      }}>
        {/* Unified Header */}
        <div className="lootpools-header-container" style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '2rem',
          flexWrap: 'wrap',
          background: 'var(--bg-card)',
          borderRadius: '0.75rem',
          padding: '1.5rem',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
          border: '3px solid var(--border-emphasis)',
          width: '90%',
        }}>
          {/* Next Rotation (Left) */}
          <div style={{
            fontSize: '0.875rem',
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            background: 'var(--bg-secondary)',
            borderRadius: '0.5rem',
            padding: '0.75rem 1rem'
          }}>
            <Image
              src="/images/icons/refresh.png"
              alt=""
              width={18}
              height={18}
              style={{ imageRendering: 'pixelated', flexShrink: 0 }}
            />
            <div>
              <div style={{ fontWeight: '600' }}>Resets In</div>
              <div>{nextRotation}</div>
            </div>
          </div>

          {/* Title (Center) */}
          <div style={{
            flex: '1',
            textAlign: 'center',
            minWidth: '200px'
          }}>
            <h1 style={{
              fontSize: 'clamp(1.5rem, 3vw, 2.5rem)',
              fontWeight: '800',
              background: 'linear-gradient(135deg, var(--color-ocean-400), var(--color-ocean-600))',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              margin: 0,
              letterSpacing: '-0.02em'
            }}>
              {activeTab === 'lootruns' ? 'Weekly Mythic Lootpool' : 'Weekly Raid Aspects'}
            </h1>
          </div>

          {/* Tab Selector (Right) */}
          <div
            className="lootpools-tab-selector"
            role="tablist"
            aria-label="Lootpool view"
            data-active-tab={activeTab}
          >
            <span className="lootpools-tab-indicator" aria-hidden="true" />
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'lootruns'}
              className={`lootpools-tab-button ${activeTab === 'lootruns' ? 'is-active' : ''}`}
              onClick={() => switchTab('lootruns')}
            >
              <Image src="/images/icons/lootrun-sigil.png" alt="" width={34} height={34} style={{ imageRendering: 'pixelated' }} />
              Lootruns
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'raids'}
              className={`lootpools-tab-button ${activeTab === 'raids' ? 'is-active' : ''}`}
              onClick={() => switchTab('raids')}
            >
              <Image src="/images/icons/raid.png" alt="" width={34} height={34} style={{ imageRendering: 'pixelated' }} />
              Raids
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="lootpools-scroll-area themed-scrollbar">
        <div className="lootpools-content-stage">
          {exitingTab && (
            <div
              key={`exiting-${exitingTab}`}
              className="lootpools-content-pane is-exiting"
              aria-hidden="true"
            >
              {renderTabContent(exitingTab)}
            </div>
          )}
          <div
            key={`active-${activeTab}`}
            className={`lootpools-content-pane ${exitingTab ? 'is-entering' : ''}`}
          >
            {renderTabContent(activeTab)}
          </div>
        </div>
      </div>
    </div>
  );
}

// Lootruns component
function LootrunsView({ data }: { data: LootData }) {
  const loot = data.Loot || data.Items || {};
  const regions = Object.keys(loot);

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center'
    }}>
      {/* Lootrun Regions Grid */}
      <div className="lootpools-grid-container" style={{
        width: '96%',
      }}>
        {regions.map(regionName => (
          <LootrunColumn
            key={regionName}
            regionName={regionName}
            regionData={loot[regionName] || {}}
            icons={data.Icon}
          />
        ))}
      </div>
    </div>
  );
}

// nori.fish uses NOG for NOTG and TWP for WTP
const RAID_DISPLAY_ORDER = ["TNA", "TCC", "NOL", "NOG", "TWP"];
// Map nori.fish abbreviations to local image filename prefixes
const RAID_ICON_MAP: { [key: string]: string } = { "NOG": "NOTG", "TWP": "WTP" };
// Display names shown under the icon
const RAID_DISPLAY_NAMES: { [key: string]: string } = { "NOG": "NOTG", "TWP": "WTP" };

// Raids component
function RaidsView({ data }: { data: LootData }) {
  const loot = data.Aspects || data.Loot || {};

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center'
    }}>
      {/* Raid Aspects Grid */}
      <div className="lootpools-grid-container" style={{
        width: '96%',
        maxWidth: '1200px'
      }}>
        {RAID_DISPLAY_ORDER.map(raid => (
          <RaidColumn
            key={raid}
            raid={RAID_DISPLAY_NAMES[raid] || raid}
            iconKey={RAID_ICON_MAP[raid] || raid}
            aspects={loot[raid] || {}}
          />
        ))}
      </div>
    </div>
  );
}


function ShinySparkleIcon({ style }: { style?: React.CSSProperties }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      width="14"
      height="14"
      style={style}
    >
      <path
        d="M7.4 1.4 8.9 5l3.7 1.5-3.7 1.6-1.5 3.6-1.6-3.6-3.6-1.6L5.8 5l1.6-3.6Z"
        fill="currentColor"
      />
      <path
        d="m12.7 9.4.6 1.4 1.4.6-1.4.6-.6 1.5-.6-1.5-1.4-.6 1.4-.6.6-1.4Z"
        fill="currentColor"
        opacity="0.9"
      />
    </svg>
  );
}

// Lootrun column component (matches raid column styling)
function LootrunColumn({ regionName, regionData, icons }: {
  regionName: string;
  regionData: any;
  icons?: { [itemName: string]: string };
}) {
  const regionMap: { [key: string]: { name: string; image: string } } = {
    'SE': { name: 'Silent Expanse', image: 'silent-expanse.webp' },
    'Sky': { name: 'Sky Islands', image: 'sky-islands.webp' },
    'Canyon': { name: 'Canyon of the Lost', image: 'canyon-of-the-lost.webp' },
    'Corkus': { name: 'Corkus', image: 'corkus.webp' },
    'Molten': { name: 'Molten Heights', image: 'molten-heights.webp' },
    'FrumaEast': { name: 'Fruma East', image: 'fruma-east.webp' },
    'FrumaWest': { name: 'Fruma West', image: 'fruma-west.webp' }
  };

  const regionInfo = regionMap[regionName] || { name: regionName, image: '' };
  
  const rarityColors = {
    Mythic: '#aa00aa',
    Fabled: '#ff5555',
    Legendary: '#55ffff',
    Rare: '#ffff55',
    Unique: '#ff7f50'
  };

  const shinyItem = regionData.Shiny?.Item;
  const shinyTracker = regionData.Shiny?.Tracker;

  return (
    <div className="lootpool-card" style={{
      background: 'var(--bg-card)',
      borderRadius: '1rem',
      padding: 'var(--lootpool-card-padding)',
      boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
      border: '3px solid var(--border-emphasis)',
      height: 'fit-content'
    }}>
      {/* Region image */}
      <div style={{
        width: '100%',
        aspectRatio: '1920 / 991',
        borderRadius: '0.5rem',
        margin: '0 auto 1rem auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden',
        background: 'var(--bg-secondary)',
        color: 'var(--text-muted)',
        fontSize: '3rem',
        boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.12)'
      }}>
        {regionInfo.image ? (
          <Image
            src={`/images/lootruns/${regionInfo.image}`}
            alt={`${regionInfo.name} lootrun camp`}
            fill
            sizes="(max-width: 640px) 80vw, (max-width: 1200px) 28vw, 12vw"
            style={{
              objectFit: 'cover',
              objectPosition: 'center',
            }}
          />
        ) : (
          '📦'
        )}
      </div>
      
      <h3 className="lootpool-card-title" style={{
        fontSize: 'var(--lootpool-title-size)',
        fontWeight: '700',
        color: 'var(--text-primary)',
        textAlign: 'center',
        marginBottom: '1rem'
      }}>
        {regionInfo.name}
      </h3>

      {/* Items by rarity - Mythic and Shiny */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {(() => {
          const mythicItems = regionData.Mythic || [];
          const shinyItem = regionData.Shiny?.Item;
          
          const allItems = shinyItem
            ? [shinyItem, ...mythicItems.filter((item: string) => item !== shinyItem)]
            : mythicItems;
          
          return allItems.map((item: string, index: number) => {
            const isShiny = item === shinyItem;
            const itemIsWard = isWard(item);
            const wardColor = getWardColor(item);
            return (
            <div
              key={`item-${index}`}
              className="lootpool-entry"
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 'var(--lootpool-entry-gap)',
              padding: 'var(--lootpool-entry-padding)',
              background: 'var(--bg-card)',
              borderRadius: '0.5rem',
              border: '1px solid var(--border-card)',
              backdropFilter: 'blur(8px)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              transition: 'all 0.2s ease',
              position: 'relative',
              paddingRight: isShiny ? '1.5rem' : 'var(--lootpool-entry-padding)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-1px)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
            }}
          >
            {/* Item icon (or colored ward swatch for ward items) */}
            <div style={{
              width: '20px',
              height: '20px',
              borderRadius: '0.25rem',
              flexShrink: 0,
              position: 'relative',
              overflow: 'hidden',
              marginTop: '0.0625rem'
            }}>
              {itemIsWard ? (
                <Image
                  src={`/images/wards/${getWardImage(item)}`}
                  alt={item}
                  width={20}
                  height={20}
                  style={{
                    objectFit: 'contain',
                    width: '100%',
                    height: '100%'
                  }}
                />
              ) : (
                <Image
                  src={`/images/mythics/${getImageForItem(item)}`}
                  alt={item}
                  width={20}
                  height={20}
                  style={{
                    objectFit: 'contain',
                    width: '100%',
                    height: '100%'
                  }}
                  onError={(e) => {
                    // Hide on error
                    (e.currentTarget as HTMLElement).style.display = 'none';
                  }}
                />
              )}
            </div>

            {/* Shiny indicator */}
            {isShiny && (
              <ShinySparkleIcon style={{
                position: 'absolute',
                top: '0.35rem',
                right: '0.35rem',
                color: '#f5c842',
                filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.35))',
                pointerEvents: 'none'
              }} />
            )}

            <div className="lootpool-entry-content" style={{ flex: 1 }}>
              <span className="lootpool-entry-label" style={{
                fontSize: 'var(--lootpool-entry-text-size)',
                color: isShiny ? '#f5c842' : (itemIsWard ? wardColor : '#aa00aa'),
                fontWeight: '500'
              }}>
                {item}
              </span>
              {/* Shiny tracker */}
              {isShiny && shinyTracker && (
                <div className="lootpool-entry-meta" style={{
                  fontSize: 'var(--lootpool-entry-meta-size)',
                  color: '#f5c842',
                  fontWeight: '400',
                  marginTop: '0.25rem'
                }}>
                  {shinyTracker}
                </div>
              )}
            </div>
            </div>
            );
          });
        })()}
      </div>
    </div>
  );
}

// Raid column component
function RaidColumn({ raid, iconKey, aspects }: {
  raid: string;
  iconKey: string;
  aspects: any;
}) {
  const rarityColors = {
    Mythic: '#aa00aa',
    Fabled: '#ff5555',
    Legendary: '#55ffff'
  };

  return (
    <div className="lootpool-card" style={{
      background: 'var(--bg-card)',
      borderRadius: '1rem',
      padding: 'var(--lootpool-card-padding)',
      boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
      border: '3px solid var(--border-emphasis)',
      height: 'fit-content'
    }}>
      {/* Raid icon */}
      <div style={{
        width: '120px',
        height: '120px',
        borderRadius: '0.5rem',
        margin: '0 auto 1rem auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden'
      }}>
        <Image
          src={`/images/raids/${raidImageMap[iconKey] || iconKey + '.png'}`}
          alt={raid}
          width={100}
          height={100}
          style={{
            objectFit: 'contain',
            maxWidth: '100%',
            maxHeight: '100%'
          }}
          onError={(e) => {
            // Fallback to text on error
            const target = e.currentTarget;
            target.style.display = 'none';
            const fallback = target.nextElementSibling as HTMLElement;
            if (fallback) {
              fallback.style.display = 'flex';
            }
          }}
        />
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: 'none',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '2rem'
        }}>
          ⚔️
        </div>
      </div>
      
      <h3 className="lootpool-card-title" style={{
        fontSize: 'var(--lootpool-title-size)',
        fontWeight: '700',
        color: 'var(--text-primary)',
        textAlign: 'center',
        marginBottom: '1rem'
      }}>
        {raid}
      </h3>

      {/* Aspects by rarity */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {Object.entries(rarityColors).map(([rarity, color]) => {
          const aspectList = (aspects[rarity] || []).filter((aspect: string) => !isWard(aspect));
          return aspectList.map((aspect: string, index: number) => {
            let displayName = aspect;
            if (aspect.includes("Aspect of a ")) {
              displayName = aspect.replace("Aspect of a ", "");
            } else if (aspect.includes("Aspect of the ")) {
              displayName = aspect.replace("Aspect of the ", "");
            } else if (aspect.includes("Aspect of ")) {
              displayName = aspect.replace("Aspect of ", "");
            }

            return (
              <div
                key={`${rarity}-${index}`}
                className="lootpool-entry"
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 'var(--lootpool-entry-gap)',
                  padding: 'var(--lootpool-entry-padding)',
                  background: 'var(--bg-card)',
                  borderRadius: '0.5rem',
                  border: '1px solid var(--border-card)',
                  backdropFilter: 'blur(8px)',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
                }}
              >
                {/* Class icon (or colored ward swatch for ward items) */}
                <div style={{
                  width: '20px',
                  height: '20px',
                  borderRadius: '0.25rem',
                  flexShrink: 0,
                  position: 'relative',
                  overflow: 'hidden',
                  marginTop: '0.0625rem'
                }}>
                  {(() => {
                    const aspectClass = getClassForAspect(aspect);
                    if (aspectClass && classImageMap[aspectClass]) {
                      return (
                        <Image
                          src={`/images/raids/${classImageMap[aspectClass]}`}
                          alt={aspectClass}
                          width={20}
                          height={20}
                          style={{
                            objectFit: 'contain',
                            width: '100%',
                            height: '100%'
                          }}
                          onError={(e) => {
                            // Hide on error
                            (e.currentTarget as HTMLElement).style.display = 'none';
                          }}
                        />
                      );
                    }
                    return null;
                  })()}
                </div>

                <div className="lootpool-entry-content" style={{ flex: 1 }}>
                  <span className="lootpool-entry-label" style={{
                    fontSize: 'var(--lootpool-entry-text-size)',
                    color,
                    fontWeight: '500'
                  }}>
                    {displayName}
                  </span>
                </div>
              </div>
            );
          });
        })}
      </div>
    </div>
  );
}
