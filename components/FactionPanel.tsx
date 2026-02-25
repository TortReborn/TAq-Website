"use client";

import React, { useMemo, useState, useRef, useEffect, useCallback } from "react";

interface FactionData {
  name: string;
  color: string;
  guilds: string[]; // guild names
}

interface GuildInfo {
  name: string;
  prefix: string;
}

interface FactionPanelProps {
  isOpen: boolean;
  onClose: () => void;
  factions: Record<string, FactionData>;
  onFactionsChange: (factions: Record<string, FactionData>) => void;
  availableGuilds: GuildInfo[];
}

// Default faction colors to cycle through
const DEFAULT_COLORS = [
  "#e53935", "#d81b60", "#8e24aa", "#5e35b1",
  "#3949ab", "#1e88e5", "#039be5", "#00acc1",
  "#00897b", "#43a047", "#7cb342", "#c0ca33",
  "#fdd835", "#ffb300", "#fb8c00", "#f4511e",
];

let colorIndex = 0;
function nextDefaultColor(): string {
  const color = DEFAULT_COLORS[colorIndex % DEFAULT_COLORS.length];
  colorIndex++;
  return color;
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

const GUILDS_PER_COLUMN = 10;
const GUILD_ROW_HEIGHT = 22; // px per guild row

export default function FactionPanel({
  isOpen,
  onClose,
  factions,
  onFactionsChange,
  availableGuilds,
}: FactionPanelProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [editingFactionId, setEditingFactionId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);

  // Drag state
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const isDragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  // Initialize position on first open
  useEffect(() => {
    if (isOpen && position === null) {
      setPosition({
        x: Math.max(0, window.innerWidth - 500),
        y: Math.max(0, window.innerHeight - 500),
      });
    }
  }, [isOpen, position]);

  // Auto-create 2 factions on first open if none exist
  useEffect(() => {
    if (isOpen && Object.keys(factions).length === 0) {
      const id1 = generateId();
      // Small delay to avoid double-generate on same ms
      const id2 = generateId() + "b";
      onFactionsChange({
        [id1]: { name: "Faction 1", color: "#1e88e5", guilds: [] },
        [id2]: { name: "Faction 2", color: "#e53935", guilds: [] },
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Clamp position within viewport
  const clampPosition = useCallback((x: number, y: number) => {
    const panelW = panelRef.current?.offsetWidth || 400;
    const panelH = panelRef.current?.offsetHeight || 400;
    return {
      x: Math.max(0, Math.min(x, window.innerWidth - panelW)),
      y: Math.max(0, Math.min(y, window.innerHeight - panelH)),
    };
  }, []);

  // Drag handlers on document
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const clamped = clampPosition(
        e.clientX - dragOffset.current.x,
        e.clientY - dragOffset.current.y
      );
      setPosition(clamped);
    };
    const onMouseUp = () => {
      isDragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [clampPosition]);

  const onHeaderMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button, input")) return;
    isDragging.current = true;
    dragOffset.current = {
      x: e.clientX - (position?.x || 0),
      y: e.clientY - (position?.y || 0),
    };
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";
    e.preventDefault();
    e.stopPropagation();
  };

  // Build a map of guild -> faction id for quick lookup
  const guildToFaction = useMemo(() => {
    const map: Record<string, string> = {};
    for (const [factionId, faction] of Object.entries(factions)) {
      for (const guildName of faction.guilds) {
        map[guildName] = factionId;
      }
    }
    return map;
  }, [factions]);

  // Filter guilds by search (only when searching)
  const filteredGuilds = useMemo(() => {
    if (!searchTerm.trim()) return [];
    const term = searchTerm.toLowerCase();
    return availableGuilds.filter(
      (g) =>
        g.name.toLowerCase().includes(term) ||
        g.prefix.toLowerCase().includes(term)
    );
  }, [availableGuilds, searchTerm]);

  if (!isOpen) return null;

  const factionEntries = Object.entries(factions);

  function createFaction() {
    const id = generateId();
    const newFaction: FactionData = {
      name: `Faction ${factionEntries.length + 1}`,
      color: nextDefaultColor(),
      guilds: [],
    };
    onFactionsChange({ ...factions, [id]: newFaction });
    setEditingFactionId(id);
    setEditingName(newFaction.name);
  }

  function deleteFaction(id: string) {
    const updated = { ...factions };
    delete updated[id];
    onFactionsChange(updated);
  }

  function renameFaction(id: string, newName: string) {
    if (!factions[id]) return;
    onFactionsChange({
      ...factions,
      [id]: { ...factions[id], name: newName || factions[id].name },
    });
    setEditingFactionId(null);
  }

  function changeFactionColor(id: string, color: string) {
    if (!factions[id]) return;
    onFactionsChange({
      ...factions,
      [id]: { ...factions[id], color },
    });
  }

  function assignGuild(guildName: string, factionId: string) {
    const updated = { ...factions };
    for (const [fid, faction] of Object.entries(updated)) {
      if (faction.guilds.includes(guildName)) {
        updated[fid] = {
          ...faction,
          guilds: faction.guilds.filter((g) => g !== guildName),
        };
      }
    }
    if (updated[factionId]) {
      updated[factionId] = {
        ...updated[factionId],
        guilds: [...updated[factionId].guilds, guildName],
      };
    }
    onFactionsChange(updated);
  }

  function removeGuildFromFaction(factionId: string, guildName: string) {
    if (!factions[factionId]) return;
    onFactionsChange({
      ...factions,
      [factionId]: {
        ...factions[factionId],
        guilds: factions[factionId].guilds.filter((g) => g !== guildName),
      },
    });
  }

  const stopPropagation = (e: React.SyntheticEvent) => e.stopPropagation();

  // Check if the search term is a custom guild (not on map)
  const isCustomEntry = searchTerm.trim() && filteredGuilds.length === 0;
  const hasExactMatch = searchTerm.trim() && filteredGuilds.some(
    g => g.name.toLowerCase() === searchTerm.trim().toLowerCase() ||
         g.prefix.toLowerCase() === searchTerm.trim().toLowerCase()
  );

  return (
    <div
      ref={panelRef}
      style={{
        position: "fixed",
        left: position ? `${position.x}px` : "auto",
        top: position ? `${position.y}px` : "auto",
        minWidth: "340px",
        maxWidth: "90vw",
        maxHeight: "80vh",
        backgroundColor: "var(--bg-card-solid)",
        border: "2px solid var(--border-color)",
        borderRadius: "0.75rem",
        boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
        pointerEvents: "auto",
        display: "flex",
        flexDirection: "column",
        zIndex: 20,
      }}
      onWheel={stopPropagation}
      onMouseDown={stopPropagation}
      onMouseMove={stopPropagation}
      onMouseUp={stopPropagation}
      onTouchStart={stopPropagation}
      onTouchMove={stopPropagation}
      onTouchEnd={stopPropagation}
    >
      {/* Header — drag handle */}
      <div
        onMouseDown={onHeaderMouseDown}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          padding: "0.5rem 0.75rem",
          borderBottom: "1px solid var(--border-color)",
          flexShrink: 0,
          cursor: "grab",
        }}
      >
        <h3
          style={{
            margin: 0,
            fontWeight: "bold",
            fontSize: "0.95rem",
            color: "var(--accent-color)",
            flex: 1,
          }}
        >
          Factions
        </h3>
        <button
          onClick={createFaction}
          style={{
            background: "var(--accent-primary)",
            color: "var(--text-on-accent)",
            border: "none",
            borderRadius: "0.375rem",
            padding: "0.2rem 0.5rem",
            fontSize: "0.72rem",
            fontWeight: "600",
            cursor: "pointer",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.85"; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
        >
          + New
        </button>
        <button
          onClick={onClose}
          style={{
            background: "transparent",
            border: "none",
            color: "var(--text-secondary)",
            cursor: "pointer",
            padding: "4px",
            borderRadius: "4px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--bg-secondary)";
            e.currentTarget.style.color = "var(--text-primary)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "var(--text-secondary)";
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Scrollable content */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "0.75rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
        }}
        className="faction-panel-scroll"
      >
        {/* Search bar */}
        <div style={{ position: "relative" }}>
          <input
            type="text"
            placeholder="Search guilds to add..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: "100%",
              padding: "0.4rem 0.5rem",
              borderRadius: "0.375rem",
              border: "1px solid var(--border-color)",
              background: "var(--bg-primary)",
              color: "var(--text-primary)",
              fontSize: "0.8rem",
              outline: "none",
              boxSizing: "border-box",
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = "var(--accent-primary)"; }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "var(--border-color)";
              // Delay hiding suggestions so clicks register
              setTimeout(() => {}, 200);
            }}
          />

          {/* Suggestions dropdown */}
          {searchTerm.trim() && (
            <div
              style={{
                marginTop: "0.25rem",
                background: "var(--bg-card-solid)",
                border: "1px solid var(--border-color)",
                borderRadius: "0.375rem",
                boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                maxHeight: "200px",
                overflowY: "auto",
              }}
              className="faction-panel-scroll"
            >
              {filteredGuilds.slice(0, 10).map((guild) => {
                const assignedFid = guildToFaction[guild.name];
                return (
                  <div
                    key={guild.name}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      padding: "0.3rem 0.5rem",
                      gap: "0.375rem",
                      borderBottom: "1px solid var(--border-color)",
                    }}
                  >
                    <span style={{
                      fontSize: "0.78rem",
                      color: "var(--text-primary)",
                      flex: 1,
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}>
                      <span style={{ fontWeight: "600" }}>[{guild.prefix}]</span>{" "}
                      <span style={{ color: "var(--text-secondary)" }}>{guild.name}</span>
                    </span>
                    {assignedFid && (
                      <span style={{
                        fontSize: "0.65rem",
                        color: factions[assignedFid]?.color || "var(--text-secondary)",
                        fontWeight: "600",
                        marginRight: "0.25rem",
                      }}>
                        {factions[assignedFid]?.name}
                      </span>
                    )}
                    <div style={{ display: "flex", gap: "0.2rem", flexShrink: 0 }}>
                      {factionEntries.map(([fid, f]) => (
                        <button
                          key={fid}
                          onClick={() => { assignGuild(guild.name, fid); setSearchTerm(""); }}
                          title={`Add to ${f.name}`}
                          style={{
                            width: "18px",
                            height: "18px",
                            borderRadius: "3px",
                            border: assignedFid === fid ? "2px solid var(--text-primary)" : "1px solid var(--border-color)",
                            background: f.color,
                            cursor: "pointer",
                            padding: 0,
                            flexShrink: 0,
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.75"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}

              {/* Custom guild entry - show when no matches or as extra option */}
              {(isCustomEntry || (!hasExactMatch && searchTerm.trim())) && factionEntries.length > 0 && (
                <div style={{
                  padding: "0.3rem 0.5rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.375rem",
                }}>
                  <span style={{
                    fontSize: "0.78rem",
                    color: "var(--text-secondary)",
                    flex: 1,
                    fontStyle: "italic",
                  }}>
                    Add &ldquo;{searchTerm.trim()}&rdquo;
                  </span>
                  <div style={{ display: "flex", gap: "0.2rem", flexShrink: 0 }}>
                    {factionEntries.map(([fid, f]) => (
                      <button
                        key={fid}
                        onClick={() => { assignGuild(searchTerm.trim(), fid); setSearchTerm(""); }}
                        title={`Add to ${f.name}`}
                        style={{
                          width: "18px",
                          height: "18px",
                          borderRadius: "3px",
                          border: "1px solid var(--border-color)",
                          background: f.color,
                          cursor: "pointer",
                          padding: 0,
                          flexShrink: 0,
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.75"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {filteredGuilds.length === 0 && !searchTerm.trim() && (
                <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", textAlign: "center", margin: "0.5rem 0" }}>
                  No guilds found.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Faction columns */}
        {factionEntries.length > 0 && (
          <div style={{
            display: "flex",
            gap: "0.5rem",
            alignItems: "flex-start",
          }}>
            {factionEntries.map(([factionId, faction]) => {
              const colCount = Math.max(1, Math.ceil(faction.guilds.length / GUILDS_PER_COLUMN));
              return (
                <div
                  key={factionId}
                  style={{
                    flex: 1,
                    minWidth: `${Math.max(120, colCount * 100)}px`,
                    background: "var(--bg-secondary)",
                    borderRadius: "0.5rem",
                    border: "1px solid var(--border-color)",
                    overflow: "hidden",
                  }}
                >
                  {/* Faction header */}
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.375rem",
                    padding: "0.4rem 0.5rem",
                    borderBottom: "1px solid var(--border-color)",
                    background: faction.color + "15",
                  }}>
                    <input
                      type="color"
                      value={faction.color}
                      onChange={(e) => changeFactionColor(factionId, e.target.value)}
                      style={{
                        width: "20px",
                        height: "20px",
                        border: "2px solid var(--border-color)",
                        borderRadius: "3px",
                        padding: 0,
                        cursor: "pointer",
                        flexShrink: 0,
                        background: "none",
                      }}
                    />
                    {editingFactionId === factionId ? (
                      <input
                        autoFocus
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onBlur={() => renameFaction(factionId, editingName)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") renameFaction(factionId, editingName);
                          if (e.key === "Escape") setEditingFactionId(null);
                        }}
                        style={{
                          flex: 1,
                          minWidth: 0,
                          background: "var(--bg-primary)",
                          border: "1px solid var(--accent-primary)",
                          borderRadius: "0.25rem",
                          color: "var(--text-primary)",
                          fontSize: "0.8rem",
                          fontWeight: "600",
                          padding: "0.1rem 0.3rem",
                          outline: "none",
                        }}
                      />
                    ) : (
                      <span
                        style={{
                          flex: 1,
                          fontSize: "0.8rem",
                          fontWeight: "600",
                          color: "var(--text-primary)",
                          cursor: "pointer",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          minWidth: 0,
                        }}
                        onDoubleClick={() => {
                          setEditingFactionId(factionId);
                          setEditingName(faction.name);
                        }}
                        title="Double-click to rename"
                      >
                        {faction.name}
                        <span style={{ color: "var(--text-secondary)", fontWeight: "400", fontSize: "0.7rem", marginLeft: "0.25rem" }}>
                          ({faction.guilds.length})
                        </span>
                      </span>
                    )}
                    <button
                      onClick={() => deleteFaction(factionId)}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "var(--text-secondary)",
                        cursor: "pointer",
                        padding: "2px",
                        borderRadius: "3px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = "#e53935"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-secondary)"; }}
                      title="Delete faction"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </div>

                  {/* Guild list — flows in columns of GUILDS_PER_COLUMN */}
                  <div style={{
                    padding: "0.375rem 0.5rem",
                    minHeight: "2rem",
                  }}>
                    {faction.guilds.length === 0 ? (
                      <p style={{
                        fontSize: "0.7rem",
                        color: "var(--text-secondary)",
                        margin: 0,
                        textAlign: "center",
                        fontStyle: "italic",
                      }}>
                        Search above to add guilds
                      </p>
                    ) : (
                      <div style={{
                        columnCount: colCount,
                        columnGap: "0.5rem",
                      }}>
                        {faction.guilds.map((guildName) => {
                          const guild = availableGuilds.find((g) => g.name === guildName);
                          const displayName = guild?.prefix ? `[${guild.prefix}]` : guildName;
                          return (
                            <div
                              key={guildName}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "0.2rem",
                                padding: "0.1rem 0",
                                breakInside: "avoid",
                                height: `${GUILD_ROW_HEIGHT}px`,
                              }}
                            >
                              <span
                                style={{
                                  fontSize: "0.72rem",
                                  color: "var(--text-primary)",
                                  flex: 1,
                                  minWidth: 0,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                                title={guild ? `${guild.name} [${guild.prefix}]` : guildName}
                              >
                                {displayName}
                              </span>
                              <button
                                onClick={() => removeGuildFromFaction(factionId, guildName)}
                                style={{
                                  background: "transparent",
                                  border: "none",
                                  color: "var(--text-secondary)",
                                  cursor: "pointer",
                                  padding: "0",
                                  fontSize: "0.75rem",
                                  lineHeight: 1,
                                  display: "flex",
                                  alignItems: "center",
                                  flexShrink: 0,
                                  opacity: 0.6,
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.color = "#e53935"; e.currentTarget.style.opacity = "1"; }}
                                onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-secondary)"; e.currentTarget.style.opacity = "0.6"; }}
                              >
                                ×
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {factionEntries.length === 0 && (
          <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", textAlign: "center", margin: "0.5rem 0" }}>
            No factions. Click &quot;+ New&quot; to create one.
          </p>
        )}
      </div>

      <style jsx>{`
        .faction-panel-scroll::-webkit-scrollbar {
          width: 6px;
        }
        .faction-panel-scroll::-webkit-scrollbar-track {
          background: var(--bg-secondary);
          border-radius: 6px;
        }
        .faction-panel-scroll::-webkit-scrollbar-thumb {
          background: var(--border-color);
          border-radius: 6px;
        }
        .faction-panel-scroll::-webkit-scrollbar-thumb:hover {
          background: var(--accent-color);
        }
        .faction-panel-scroll {
          scrollbar-width: thin;
          scrollbar-color: var(--border-color) var(--bg-secondary);
        }
      `}</style>
    </div>
  );
}
