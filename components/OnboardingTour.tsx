"use client";

import { useEffect, useMemo } from 'react';
import type { OnboardingTourState } from '@/hooks/useOnboardingTour';

const TOOLTIP_WIDTH = 300;
const TOOLTIP_HEIGHT_EST = 220;
const GAP = 16;

function getTooltipCoords(
  position: 'center' | 'right' | 'bottom',
  targetRect: DOMRect | null,
): { top: number; left: number } {
  if (position === 'center' || !targetRect) {
    return {
      top: Math.round((window.innerHeight - TOOLTIP_HEIGHT_EST) / 2),
      left: Math.round((window.innerWidth - TOOLTIP_WIDTH) / 2),
    };
  }

  if (position === 'right') {
    let top = targetRect.top;
    let left = targetRect.right + GAP;

    if (left + TOOLTIP_WIDTH > window.innerWidth - 16) {
      left = targetRect.left - TOOLTIP_WIDTH - GAP;
    }
    if (top + TOOLTIP_HEIGHT_EST > window.innerHeight) {
      top = window.innerHeight - TOOLTIP_HEIGHT_EST - 16;
    }
    if (top < 16) top = 16;

    return { top: Math.round(top), left: Math.round(left) };
  }

  // bottom — center tooltip under target
  let top = targetRect.bottom + GAP;
  let left = targetRect.left + (targetRect.width / 2) - (TOOLTIP_WIDTH / 2);

  if (left + TOOLTIP_WIDTH > window.innerWidth - 16) {
    left = window.innerWidth - TOOLTIP_WIDTH - 16;
  }
  if (left < 16) left = 16;
  if (top + TOOLTIP_HEIGHT_EST > window.innerHeight) {
    top = targetRect.top - TOOLTIP_HEIGHT_EST - GAP;
  }

  return { top: Math.round(top), left: Math.round(left) };
}

export default function OnboardingTour({
  isActive,
  currentStep,
  totalSteps,
  step,
  targetRect,
  nextStep,
  prevStep,
  skipTour,
}: OnboardingTourState) {

  // Keyboard navigation
  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        skipTour();
      } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        e.preventDefault();
        nextStep();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        prevStep();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive, nextStep, prevStep, skipTour]);

  // Prevent body scroll while tour is active
  useEffect(() => {
    if (!isActive) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = original; };
  }, [isActive]);

  const tooltipCoords = useMemo(
    () => getTooltipCoords(step.position, targetRect),
    [step.position, targetRect],
  );

  if (!isActive) return null;

  // Spotlight cutout values (rounded to prevent sub-pixel issues)
  const cutout = targetRect ? {
    x: Math.round(targetRect.left - 8),
    y: Math.round(targetRect.top - 8),
    w: Math.round(targetRect.width + 16),
    h: Math.round(targetRect.height + 16),
  } : null;

  const overlay = (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000 }}>
      {/* SVG overlay with spotlight cutout */}
      <svg
        style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', zIndex: 10000 }}
      >
        <defs>
          <mask id="tour-spotlight-mask">
            <rect width="100%" height="100%" fill="white" />
            {cutout && (
              <rect
                x={cutout.x}
                y={cutout.y}
                width={cutout.w}
                height={cutout.h}
                rx={12}
                fill="black"
                style={{ transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)' }}
              />
            )}
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="rgba(0, 0, 0, 0.7)"
          mask="url(#tour-spotlight-mask)"
        />
      </svg>

      {/* Spotlight ring glow */}
      {cutout && (
        <div
          style={{
            position: 'fixed',
            left: `${cutout.x}px`,
            top: `${cutout.y}px`,
            width: `${cutout.w}px`,
            height: `${cutout.h}px`,
            borderRadius: '12px',
            boxShadow: '0 0 0 2px var(--color-ocean-400), 0 0 20px rgba(84, 195, 231, 0.3)',
            zIndex: 10001,
            pointerEvents: 'none',
            transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
            animation: 'tourSpotlightPulse 2s ease-in-out infinite',
          }}
        />
      )}

      {/* Tooltip card */}
      <div
        style={{
          position: 'fixed',
          top: `${tooltipCoords.top}px`,
          left: `${tooltipCoords.left}px`,
          zIndex: 10002,
          background: 'var(--bg-card-solid)',
          border: '1px solid var(--border-card)',
          borderRadius: '0.75rem',
          padding: '1.25rem',
          width: '300px',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.6)',
          backdropFilter: 'blur(12px)',
          transition: 'top 0.4s cubic-bezier(0.4, 0, 0.2, 1), left 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Step counter */}
        <div style={{
          fontSize: '0.65rem',
          color: 'var(--text-secondary)',
          marginBottom: '0.5rem',
          fontWeight: '600',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}>
          {currentStep + 1} of {totalSteps}
        </div>

        {/* Title */}
        <div style={{
          fontSize: '1rem',
          fontWeight: '700',
          color: 'var(--text-primary)',
          marginBottom: '0.5rem',
        }}>
          {step.title}
        </div>

        {/* Description */}
        <div style={{
          fontSize: '0.85rem',
          color: 'var(--text-secondary)',
          lineHeight: '1.5',
          marginBottom: '1rem',
        }}>
          {step.description}
        </div>

        {/* Progress dots */}
        <div style={{
          display: 'flex',
          gap: '6px',
          marginBottom: '1rem',
        }}>
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: i === currentStep
                  ? 'var(--color-ocean-400)'
                  : i < currentStep
                    ? 'rgba(84, 195, 231, 0.4)'
                    : 'rgba(255, 255, 255, 0.15)',
                transition: 'background 0.3s ease',
              }}
            />
          ))}
        </div>

        {/* Buttons */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <button
            onClick={skipTour}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              fontSize: '0.8rem',
              cursor: 'pointer',
              padding: '0.35rem 0',
              fontWeight: '500',
              transition: 'color 0.15s ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-secondary)'; }}
          >
            Skip tour
          </button>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {currentStep > 0 && (
              <button
                onClick={prevStep}
                style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: 'var(--text-primary)',
                  fontSize: '0.8rem',
                  fontWeight: '600',
                  padding: '0.4rem 0.85rem',
                  borderRadius: '0.5rem',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'; }}
              >
                Back
              </button>
            )}
            <button
              onClick={nextStep}
              style={{
                background: 'var(--color-ocean-400)',
                border: 'none',
                color: '#fff',
                fontSize: '0.8rem',
                fontWeight: '600',
                padding: '0.4rem 1rem',
                borderRadius: '0.5rem',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.filter = 'brightness(1.15)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.filter = 'brightness(1)'; }}
            >
              {currentStep === totalSteps - 1 ? 'Done' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return overlay;
}
