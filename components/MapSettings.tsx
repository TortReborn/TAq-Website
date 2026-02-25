"use client";

import React from "react";

interface MapSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  viewMode: 'live' | 'history';
  // Live mode settings
  showTerritories: boolean;
  onShowTerritoriesChange: (value: boolean) => void;
  showTimeOutlines: boolean;
  onShowTimeOutlinesChange: (value: boolean) => void;
  showLandView: boolean;
  onShowLandViewChange: (value: boolean) => void;
  showResourceOutlines: boolean;
  onShowResourceOutlinesChange: (value: boolean) => void;
  // History mode settings
  showGuildNames: boolean;
  onShowGuildNamesChange: (value: boolean) => void;
  // Shared settings (both modes)
  showTradeRoutes: boolean;
  onShowTradeRoutesChange: (value: boolean) => void;
  opaqueFill: boolean;
  onOpaqueFillChange: (value: boolean) => void;
}

// Compact toggle switch component for grid layout
function ToggleSwitch({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "0.35rem",
        padding: "0.5rem",
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <button
        onClick={() => !disabled && onChange(!checked)}
        disabled={disabled}
        style={{
          width: "40px",
          height: "22px",
          borderRadius: "11px",
          border: "none",
          background: checked ? "#43a047" : "var(--bg-secondary)",
          cursor: disabled ? "not-allowed" : "pointer",
          position: "relative",
          transition: "background 0.2s ease",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            position: "absolute",
            top: "2px",
            left: checked ? "20px" : "2px",
            width: "18px",
            height: "18px",
            borderRadius: "50%",
            background: "#fff",
            boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
            transition: "left 0.2s ease",
          }}
        />
      </button>
      <span style={{
        color: "var(--text-primary)",
        fontSize: "0.7rem",
        textAlign: "center",
        lineHeight: "1.2",
        whiteSpace: "nowrap",
      }}>
        {label}
      </span>
    </div>
  );
}

export default function MapSettings({
  isOpen,
  onClose,
  viewMode,
  showTerritories,
  onShowTerritoriesChange,
  showTimeOutlines,
  onShowTimeOutlinesChange,
  showLandView,
  onShowLandViewChange,
  showResourceOutlines,
  onShowResourceOutlinesChange,
  showGuildNames,
  onShowGuildNamesChange,
  showTradeRoutes,
  onShowTradeRoutesChange,
  opaqueFill,
  onOpaqueFillChange,
}: MapSettingsProps) {
  if (!isOpen) return null;

  // Different settings based on view mode
  const settings = viewMode === 'live' ? [
    // Live mode: Full settings in 2 columns
    // Column 2 (rightmost)
    [
      { key: "landView", label: "Land View", checked: showLandView, onChange: onShowLandViewChange, disabled: false },
      { key: "resourceOutlines", label: "Resources", checked: showResourceOutlines, onChange: onShowResourceOutlinesChange, disabled: showLandView },
    ],
    // Column 1 (leftmost)
    [
      { key: "territories", label: "Territories", checked: showTerritories, onChange: onShowTerritoriesChange, disabled: showLandView },
      { key: "timeOutlines", label: "Time Outlines", checked: showTimeOutlines, onChange: onShowTimeOutlinesChange, disabled: showLandView },
    ],
    // Column 0 (far left)
    [
      { key: "tradeRoutes", label: "Trade Routes", checked: showTradeRoutes, onChange: onShowTradeRoutesChange, disabled: showLandView },
      { key: "opaqueFill", label: "Opaque Fill", checked: opaqueFill, onChange: onOpaqueFillChange, disabled: false },
    ],
  ] : [
    // History mode: Guild names and trade routes toggles
    [
      { key: "guildNames", label: "Guild Names", checked: showGuildNames, onChange: onShowGuildNamesChange, disabled: false },
      { key: "tradeRoutes", label: "Trade Routes", checked: showTradeRoutes, onChange: onShowTradeRoutesChange, disabled: false },
    ],
    [
      { key: "opaqueFill", label: "Opaque Fill", checked: opaqueFill, onChange: onOpaqueFillChange, disabled: false },
    ],
  ];

  return (
    <div
      style={{
        backgroundColor: "var(--bg-card-solid)",
        border: "2px solid var(--border-color)",
        borderRadius: "0.5rem",
        padding: "0.5rem",
        boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
        pointerEvents: "auto",
        position: "relative",
      }}
      onWheel={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onMouseMove={(e) => e.stopPropagation()}
      onMouseUp={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        style={{
          position: "absolute",
          top: "0.25rem",
          right: "0.25rem",
          width: "1.25rem",
          height: "1.25rem",
          borderRadius: "0.25rem",
          border: "none",
          background: "transparent",
          color: "var(--text-secondary)",
          fontWeight: "bold",
          cursor: "pointer",
          fontSize: "1rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          lineHeight: "1",
          zIndex: 1,
        }}
      >
        ×
      </button>

      {/* Grid of settings - 2 rows, columns expand left */}
      <div
        style={{
          display: "flex",
          flexDirection: "row-reverse", // Columns added to the left
          alignItems: "flex-start",
        }}
      >
        {settings.map((column, colIndex) => (
          <div
            key={colIndex}
            style={{
              display: "flex",
              flexDirection: "column",
              borderLeft: colIndex < settings.length - 1 ? "1px solid var(--border-color)" : "none",
              paddingLeft: colIndex < settings.length - 1 ? "0.25rem" : "0",
              marginLeft: colIndex < settings.length - 1 ? "0.25rem" : "0",
            }}
          >
            {column.map((setting) => (
              <ToggleSwitch
                key={setting.key}
                checked={setting.checked}
                onChange={setting.onChange}
                label={setting.label}
                disabled={setting.disabled}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
