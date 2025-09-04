"use client";

import React, { useState, useEffect } from 'react';
import { getImageForItem, raidImageMap, classImageMap } from '@/lib/lootpool-images';
import { getClassForAspect } from '@/lib/aspect-class-map';
import { mockLootrunsData, mockAspectsData } from '@/lib/mock-lootpool-data';
import Image from 'next/image';

interface LootData {
  Timestamp: number;
  Loot: {
    [region: string]: {
      Mythic?: string[];
      Fabled?: string[];
      Legendary?: string[];
      Shiny?: {
        Item: string;
        Tracker: string;
      };
    };
  };
}

export default function LootpoolsPage() {
  const [activeTab, setActiveTab] = useState<'lootruns' | 'raids'>('raids');
  const [lootrunsData, setLootrunsData] = useState<LootData | null>(null);
  const [aspectsData, setAspectsData] = useState<LootData | null>(null);
  const [usingMockData, setUsingMockData] = useState({ lootruns: false, aspects: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      
      try {
        // Only fetch aspects data since lootruns is coming soon
        console.log('Fetching aspects data...');
        const aspectsResponse = await fetch('/api/lootpools/aspects').catch(err => {
          console.error('Aspects fetch failed:', err);
          return { ok: false, json: () => Promise.resolve(null) };
        });

        const aspectsData = aspectsResponse.ok ? await aspectsResponse.json() : null;
        setAspectsData(aspectsData || mockAspectsData);
        setUsingMockData(prev => ({ ...prev, aspects: !aspectsData }));

        // Set lootruns to mock data (not fetching since it's disabled)
        setLootrunsData(mockLootrunsData);
        setUsingMockData(prev => ({ ...prev, lootruns: true }));

      } catch (err) {
        console.error('General fetch error:', err);
        setError('Failed to load lootpool data. Please try again later.');
        // Fallback to mock data even on general error
        setLootrunsData(mockLootrunsData);
        setAspectsData(mockAspectsData);
        setUsingMockData({ lootruns: true, aspects: true });
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const formatNextRotation = (timestamp: number) => {
    const nextRotation = new Date((timestamp + 604800) * 1000);
    return nextRotation.toLocaleString();
  };

  if (loading) {
    return (
      <div style={{ 
        padding: '2rem', 
        textAlign: 'center',
        minHeight: '50vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div style={{ fontSize: '1.125rem', color: 'var(--text-muted)' }}>
          Loading lootpool data...
        </div>
      </div>
    );
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
          color: '#e33232',
          background: 'var(--bg-card)',
          padding: '1.5rem',
          borderRadius: '0.5rem',
          border: '1px solid #e33232'
        }}>
          ❌ {error}
        </div>
      </div>
    );
  }

  return (
    <div style={{ 
      padding: '2rem', 
      maxWidth: '1400px', 
      margin: '0 auto',
      minHeight: '100vh'
    }}>
      {/* Tab Toggle */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        marginBottom: '2rem',
        background: 'var(--bg-card)',
        borderRadius: '0.75rem',
        padding: '0.5rem',
        width: 'fit-content',
        margin: '0 auto 2rem auto',
        boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
      }}>
        <button
          disabled
          title="Coming soon!"
          style={{
            padding: '0.75rem 1.5rem',
            background: 'var(--card-background)',
            color: 'var(--text-muted)',
            border: '1px solid var(--border-color)',
            borderRadius: '0.5rem',
            fontSize: '1rem',
            fontWeight: '600',
            cursor: 'not-allowed',
            opacity: 0.6,
            transition: 'all 0.3s ease'
          }}
        >
          🏃 Lootruns
        </button>
        <button
          onClick={() => setActiveTab('raids')}
          style={{
            padding: '0.75rem 1.5rem',
            background: activeTab === 'raids' ? '#7a187a' : 'transparent',
            color: activeTab === 'raids' ? 'white' : 'var(--text-primary)',
            border: 'none',
            borderRadius: '0.5rem',
            fontSize: '1rem',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.3s ease'
          }}
        >
          ⚔️ Raids
        </button>
      </div>

      {/* Content */}
      {activeTab === 'lootruns' && lootrunsData && (
        <div>
          {usingMockData.lootruns && (
            <div style={{
              background: '#ff6b35',
              color: 'white',
              padding: '0.75rem',
              borderRadius: '0.5rem',
              marginBottom: '1rem',
              textAlign: 'center',
              fontSize: '0.875rem',
              fontWeight: '600'
            }}>
              ⚠️ Using demo data - Live lootpool API temporarily unavailable
            </div>
          )}
          <LootrunsView data={lootrunsData} />
        </div>
      )}
      
      {activeTab === 'raids' && aspectsData && (
        <div>
          {usingMockData.aspects && (
            <div style={{
              background: '#ff6b35',
              color: 'white',
              padding: '0.75rem',
              borderRadius: '0.5rem',
              marginBottom: '1rem',
              textAlign: 'center',
              fontSize: '0.875rem',
              fontWeight: '600'
            }}>
              ⚠️ Using demo data - Live aspects API temporarily unavailable
            </div>
          )}
          <RaidsView data={aspectsData} />
        </div>
      )}
    </div>
  );
}

// Lootruns component
function LootrunsView({ data }: { data: LootData }) {
  const nextRotation = formatNextRotation(data.Timestamp);
  
  return (
    <div>
      <div style={{
        textAlign: 'center',
        marginBottom: '2rem'
      }}>
        <h1 style={{
          fontSize: '2rem',
          fontWeight: '800',
          color: '#7a187a',
          marginBottom: '0.5rem'
        }}>
          Weekly Mythic Lootpool
        </h1>
        <div style={{
          fontSize: '1rem',
          color: 'var(--text-muted)',
          background: 'var(--bg-card)',
          padding: '0.75rem',
          borderRadius: '0.5rem',
          display: 'inline-block'
        }}>
          🔄 Next rotation: {nextRotation}
        </div>
      </div>

      {/* Lootrun Regions */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '2rem',
        alignItems: 'center'
      }}>
        {Object.entries(data.Loot).map(([regionName, regionData], index) => (
          <LootrunRegion
            key={regionName}
            regionName={regionName}
            regionData={regionData}
            index={index}
          />
        ))}
      </div>
    </div>
  );
}

// Raids component
function RaidsView({ data }: { data: LootData }) {
  const nextRotation = formatNextRotation(data.Timestamp);
  const raids = ["TNA", "TCC", "NOL", "NOTG"];
  
  return (
    <div>
      <div style={{
        textAlign: 'center',
        marginBottom: '2rem'
      }}>
        <h1 style={{
          fontSize: '2rem',
          fontWeight: '800',
          color: '#7a187a',
          marginBottom: '0.5rem'
        }}>
          Weekly Raid Aspects
        </h1>
        <div style={{
          fontSize: '1rem',
          color: 'var(--text-muted)',
          background: 'var(--bg-card)',
          padding: '0.75rem',
          borderRadius: '0.5rem',
          display: 'inline-block'
        }}>
          🔄 Next rotation: {nextRotation}
        </div>
      </div>

      {/* Raid Aspects Grid */}
      <div className="raid-aspects-grid">
        {raids.map(raid => (
          <RaidColumn
            key={raid}
            raid={raid}
            aspects={data.Loot[raid] || {}}
          />
        ))}
      </div>
    </div>
  );
}

// Helper function
function formatNextRotation(timestamp: number) {
  const nextRotation = new Date((timestamp + 604800) * 1000);
  return nextRotation.toLocaleString();
}

// Region component for lootruns
function LootrunRegion({ regionName, regionData, index }: {
  regionName: string;
  regionData: any;
  index: number;
}) {
  const regionColors = [
    { bg: '#55e340', stroke: '#218912' }, // Green
    { bg: '#edca3b', stroke: '#6b4d16' }, // Yellow
    { bg: '#58d6fc', stroke: '#1f376c' }, // Blue
    { bg: '#bd1e1e', stroke: '#630b0b' }, // Red
    { bg: '#3440eb', stroke: '#151b73' }  // Dark Blue
  ];
  
  const regionTitles = [
    "Silent Expanse Expedition",
    "The Corkus Traversal", 
    "Sky Islands Exploration",
    "Molten Heights Hike",
    "Canyon of the Lost Excursion (South)"
  ];

  const color = regionColors[index] || regionColors[0];
  const title = regionTitles[index] || regionName;
  
  const mythicItems = regionData.Mythic || [];
  const shinyItem = regionData.Shiny?.Item;
  const shinyTracker = regionData.Shiny?.Tracker;
  const allItems = shinyItem ? [shinyItem, ...mythicItems] : mythicItems;

  return (
    <div style={{
      background: 'var(--bg-card)',
      borderRadius: '1rem',
      padding: '1.5rem',
      boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
      border: '3px solid',
      borderColor: color.stroke,
      width: '100%',
      maxWidth: '800px'
    }}>
      <h2 style={{
        fontSize: '1.5rem',
        fontWeight: '700',
        color: color.bg,
        textAlign: 'center',
        marginBottom: '1rem',
        textShadow: `2px 2px 4px ${color.stroke}`
      }}>
        {title}
      </h2>
      
      <div style={{
        display: 'flex',
        gap: '1rem',
        justifyContent: 'center',
        flexWrap: 'wrap'
      }}>
        {allItems.map((item: string, itemIndex: number) => (
          <div
            key={`${item}-${itemIndex}`}
            style={{
              background: 'rgba(0,0,0,0.3)',
              borderRadius: '0.5rem',
              padding: '1rem',
              textAlign: 'center',
              position: 'relative',
              minWidth: '120px'
            }}
          >
            {/* Item image */}
            <div style={{
              width: '80px',
              height: '80px',
              background: '#2a2a2a',
              borderRadius: '0.25rem',
              margin: '0 auto 0.5rem auto',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              overflow: 'hidden'
            }}>
              <Image
                src={`/images/mythics/${getImageForItem(item)}`}
                alt={item}
                width={64}
                height={64}
                style={{
                  objectFit: 'contain',
                  maxWidth: '100%',
                  maxHeight: '100%'
                }}
                onError={(e) => {
                  // Fallback to placeholder on error
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
                fontSize: '1.5rem'
              }}>
                📦
              </div>
            </div>
            
            {/* Shiny indicator */}
            {item === shinyItem && itemIndex === 0 && (
              <div style={{
                position: 'absolute',
                top: '0.5rem',
                right: '0.5rem',
                width: '20px',
                height: '20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Image
                  src="/images/mythics/shiny.png"
                  alt="Shiny"
                  width={20}
                  height={20}
                  style={{
                    objectFit: 'contain'
                  }}
                  onError={(e) => {
                    // Fallback to emoji
                    (e.currentTarget as HTMLElement).style.display = 'none';
                    if (e.currentTarget.parentElement) {
                      e.currentTarget.parentElement.innerHTML = '✨';
                      (e.currentTarget.parentElement as HTMLElement).style.background = '#ffaa00';
                      (e.currentTarget.parentElement as HTMLElement).style.borderRadius = '50%';
                    }
                  }}
                />
              </div>
            )}
            
            <div style={{
              fontSize: '0.875rem',
              fontWeight: '600',
              color: '#aa00aa',
              marginBottom: '0.25rem'
            }}>
              {item}
            </div>
            
            {/* Shiny tracker */}
            {item === shinyItem && itemIndex === 0 && shinyTracker && (
              <div style={{
                fontSize: '0.75rem',
                color: '#ffaa00',
                fontWeight: '500'
              }}>
                {shinyTracker}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// Raid column component
function RaidColumn({ raid, aspects }: {
  raid: string;
  aspects: any;
}) {
  const rarityColors = {
    Mythic: '#aa00aa',
    Fabled: '#ff5555',
    Legendary: '#55ffff'
  };

  return (
    <div style={{
      background: 'var(--bg-card)',
      borderRadius: '1rem',
      padding: '1.5rem',
      boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
      border: '3px solid #240059',
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
          src={`/images/raids/${raidImageMap[raid] || raid + '.png'}`}
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
      
      <h3 style={{
        fontSize: '1.25rem',
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
          const aspectList = aspects[rarity] || [];
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
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.75rem',
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
                {/* Class icon */}
                <div style={{
                  width: '20px',
                  height: '20px',
                  borderRadius: '0.25rem',
                  flexShrink: 0,
                  position: 'relative',
                  overflow: 'hidden'
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
                
                <span style={{
                  fontSize: '0.875rem',
                  color: color,
                  fontWeight: '500'
                }}>
                  {displayName}
                </span>
              </div>
            );
          });
        })}
      </div>
    </div>
  );
}
