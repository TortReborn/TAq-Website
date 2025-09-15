"use client";

import React, { useState, useEffect } from 'react';
import { getImageForItem, raidImageMap, classImageMap } from '@/lib/lootpool-images';
import { getClassForAspect } from '@/lib/aspect-class-map';
import Image from 'next/image';
import PageHeader from '@/components/PageHeader';

interface LootData {
  Timestamp: number;
  Icon?: { [itemName: string]: string };
  Loot: {
    [region: string]: {
      Mythic?: string[];
      Fabled?: string[];
      Legendary?: string[];
      Rare?: string[];
      Unique?: string[];
      Shiny?: {
        Item: string;
        Tracker: string;
      };
    };
  };
}

export default function LootpoolsPage() {
  const [activeTab, setActiveTab] = useState<'lootruns' | 'raids'>('lootruns');
  const [lootrunsData, setLootrunsData] = useState<LootData | null>(null);
  const [aspectsData, setAspectsData] = useState<LootData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Helper function to handle API responses with rate limiting
  const handleApiResponse = async (response: Response, apiName: string) => {
    if (!response.ok) {
      if (response.status === 429) {
        // Rate limit exceeded - this should be shown to user
        const errorData = await response.json();
        throw new Error(`Rate limit exceeded. ${errorData.message || 'Please try again later.'}`);
      } else {
        // Other errors - return null
        return null;
      }
    }
    return await response.json();
  };

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      
      try {
        // Fetch aspects data
        const aspectsResponse = await fetch('/api/lootpools/aspects');
        const aspectsData = await handleApiResponse(aspectsResponse, 'Aspects');
        
        setAspectsData(aspectsData);

        // Fetch lootruns data
        const lootrunsResponse = await fetch('/api/lootpools/lootruns');
        const lootrunsData = await handleApiResponse(lootrunsResponse, 'Lootruns');
        setLootrunsData(lootrunsData);

      } catch (err) {
        if (err instanceof Error && err.message.includes('Rate limit exceeded')) {
          setError(err.message);
        } else {
          setError('Failed to load lootpool data. Please try again later.');
        }
        // Don't set any data on error
        setLootrunsData(null);
        setAspectsData(null);
      } finally {
        setLoading(false);
      }
    };

    // Initial fetch
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

  // Get next rotation time based on active tab
  const nextRotation = activeTab === 'lootruns'
    ? (lootrunsData ? formatNextRotation(lootrunsData.Timestamp) : null)
    : (aspectsData ? formatNextRotation(aspectsData.Timestamp) : null);

  return (
    <div style={{
      padding: '2rem',
      maxWidth: '1400px',
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
          border: '3px solid #240059',
          width: '90%',
          maxWidth: '1200px'
        }}>
          {/* Next Rotation (Left) */}
          {nextRotation && (
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
              <span style={{ fontSize: '1.125rem' }}>🔄</span>
              <div>
                <div style={{ fontWeight: '600' }}>Next Rotation</div>
                <div>{nextRotation}</div>
              </div>
            </div>
          )}

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
          <div style={{
            display: 'flex',
            gap: '0.5rem',
            background: 'var(--bg-secondary)',
            borderRadius: '0.5rem',
            padding: '0.25rem'
          }}>
            <button
              onClick={() => setActiveTab('lootruns')}
              style={{
                padding: '0.5rem 1rem',
                background: activeTab === 'lootruns' ? '#7a187a' : 'transparent',
                color: activeTab === 'lootruns' ? 'white' : 'var(--text-primary)',
                border: 'none',
                borderRadius: '0.375rem',
                fontSize: '0.875rem',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.3s ease'
              }}
            >
              🏃 Lootruns
            </button>
            <button
              onClick={() => setActiveTab('raids')}
              style={{
                padding: '0.5rem 1rem',
                background: activeTab === 'raids' ? '#7a187a' : 'transparent',
                color: activeTab === 'raids' ? 'white' : 'var(--text-primary)',
                border: 'none',
                borderRadius: '0.375rem',
                fontSize: '0.875rem',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.3s ease'
              }}
            >
              ⚔️ Raids
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      {activeTab === 'lootruns' && lootrunsData && (
        <LootrunsView data={lootrunsData} />
      )}

      {activeTab === 'raids' && aspectsData && (
        <RaidsView data={aspectsData} />
      )}
    </div>
  );
}

// Lootruns component
function LootrunsView({ data }: { data: LootData }) {
  const regions = Object.keys(data.Loot);

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center'
    }}>
      {/* Lootrun Regions Grid */}
      <div className="lootpools-grid-container lootpools-grid-5" style={{
        width: '90%',
        maxWidth: '1200px'
      }}>
        {regions.map(regionName => (
          <LootrunColumn
            key={regionName}
            regionName={regionName}
            regionData={data.Loot[regionName] || {}}
            icons={data.Icon}
          />
        ))}
      </div>
    </div>
  );
}

// Raids component
function RaidsView({ data }: { data: LootData }) {
  const raids = ["TNA", "TCC", "NOL", "NOTG"];

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center'
    }}>
      {/* Raid Aspects Grid */}
      <div className="lootpools-grid-container lootpools-grid-4" style={{
        width: '90%',
        maxWidth: '1200px'
      }}>
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

// Lootrun column component (matches raid column styling)
function LootrunColumn({ regionName, regionData, icons }: {
  regionName: string;
  regionData: any;
  icons?: { [itemName: string]: string };
}) {
  const regionMap: { [key: string]: { name: string; color: string } } = {
    'SE': { name: 'Silent Expanse', color: '#55e340' },
    'Sky': { name: 'Sky Islands', color: '#58d6fc' },
    'Canyon': { name: 'Canyon of the Lost', color: '#bd1e1e' },
    'Corkus': { name: 'Corkus', color: '#edca3b' },
    'Molten': { name: 'Molten Heights', color: '#3440eb' }
  };

  const regionInfo = regionMap[regionName] || { name: regionName, color: '#7a187a' };
  
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
    <div style={{
      background: 'var(--bg-card)',
      borderRadius: '1rem',
      padding: '1.5rem',
      boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
      border: '3px solid #240059',
      height: 'fit-content'
    }}>
      {/* Region icon placeholder */}
      <div style={{
        width: '120px',
        height: '120px',
        borderRadius: '0.5rem',
        margin: '0 auto 1rem auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden',
        background: regionInfo.color,
        color: 'white',
        fontSize: '3rem'
      }}>
        📦
      </div>
      
      <h3 style={{
        fontSize: '1.25rem',
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
          
          // Combine mythic items and shiny item (if shiny exists and isn't already in mythics)
          const allItems = [...mythicItems];
          if (shinyItem && !mythicItems.includes(shinyItem)) {
            allItems.unshift(shinyItem); // Add shiny at the beginning
          }
          
          return allItems.map((item: string, index: number) => {
            const isShiny = item === shinyItem;
            return (
            <div
              key={`item-${index}`}
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
              transition: 'all 0.2s ease',
              position: 'relative'
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
            {/* Item icon */}
            <div style={{
              width: '20px',
              height: '20px',
              borderRadius: '0.25rem',
              flexShrink: 0,
              position: 'relative',
              overflow: 'hidden'
            }}>
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
            </div>
            
            {/* Shiny indicator */}
            {isShiny && (
              <div style={{
                position: 'absolute',
                top: '0.25rem',
                right: '0.25rem',
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                background: '#ffaa00',
                fontSize: '0.6rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                ✨
              </div>
            )}
            
            <div style={{ flex: 1 }}>
              <span style={{
                fontSize: '0.875rem',
                color: isShiny ? '#ffaa00' : '#aa00aa',
                fontWeight: '500'
              }}>
                {item}
              </span>
              {/* Shiny tracker */}
              {isShiny && shinyTracker && (
                <div style={{
                  fontSize: '0.75rem',
                  color: '#ffaa00',
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
