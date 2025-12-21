"use client";

import React from "react";

interface MapSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  showTerritories: boolean;
  onShowTerritoriesChange: (value: boolean) => void;
  showTimeOutlines: boolean;
  onShowTimeOutlinesChange: (value: boolean) => void;
}

// Toggle switch component
function ToggleSwitch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: "0.75rem",
      }}
    >
      <span style={{ color: "var(--text-primary)", fontSize: "0.875rem" }}>
        {label}
      </span>
      <button
        onClick={() => onChange(!checked)}
        style={{
          width: "44px",
          height: "24px",
          borderRadius: "12px",
          border: "none",
          background: checked ? "#43a047" : "var(--bg-secondary)",
          cursor: "pointer",
          position: "relative",
          transition: "background 0.2s ease",
        }}
      >
        <span
          style={{
            position: "absolute",
            top: "2px",
            left: checked ? "22px" : "2px",
            width: "20px",
            height: "20px",
            borderRadius: "50%",
            background: "#fff",
            boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
            transition: "left 0.2s ease",
          }}
        />
      </button>
    </div>
  );
}

export default function MapSettings({
  isOpen,
  onClose,
  showTerritories,
  onShowTerritoriesChange,
  showTimeOutlines,
  onShowTimeOutlinesChange,
}: MapSettingsProps) {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "absolute",
        bottom: "1rem",
        right: "1rem",
        width: "240px",
        backgroundColor: "var(--bg-card-solid)",
        border: "2px solid var(--border-color)",
        borderRadius: "0.5rem",
        padding: "1rem",
        zIndex: 1001,
        boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
        pointerEvents: "auto",
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
          top: "0.5rem",
          right: "0.5rem",
          width: "1.5rem",
          height: "1.5rem",
          borderRadius: "0.25rem",
          border: "none",
          background: "transparent",
          color: "var(--text-secondary)",
          fontWeight: "bold",
          cursor: "pointer",
          fontSize: "1.25rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          lineHeight: "1",
        }}
      >
        ×
      </button>

      {/* Header */}
      <div
        style={{
          fontWeight: "bold",
          fontSize: "1rem",
          color: "var(--text-primary)",
          marginBottom: "1rem",
          paddingRight: "1.5rem",
        }}
      >
        Map Settings
      </div>

      {/* Settings toggles */}
      <ToggleSwitch
        checked={showTerritories}
        onChange={onShowTerritoriesChange}
        label="Show Territories"
      />
      <ToggleSwitch
        checked={showTimeOutlines}
        onChange={onShowTimeOutlinesChange}
        label="Time Outlines"
      />
    </div>
  );
}
