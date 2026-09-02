"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import TOUR_STEPS from '@/lib/onboarding-steps';
import type { TourStep } from '@/lib/onboarding-steps';

export type { TourStep };

const STORAGE_KEY = 'exec_onboarding_complete';

export interface OnboardingTourState {
  isActive: boolean;
  currentStep: number;
  totalSteps: number;
  step: TourStep;
  targetRect: DOMRect | null;
  nextStep: () => void;
  prevStep: () => void;
  skipTour: () => void;
  restartTour: () => void;
}

export function useOnboardingTour(
  enabled: boolean,
  steps: TourStep[] = TOUR_STEPS,
  storageKey: string = STORAGE_KEY,
): OnboardingTourState {
  const [isActive, setIsActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const retryRef = useRef<number>(0);

  // Auto-start on first visit
  useEffect(() => {
    if (!enabled) return;
    if (localStorage.getItem(storageKey) === 'true') return;

    const timer = setTimeout(() => {
      setIsActive(true);
      setCurrentStep(0);
    }, 600);

    return () => clearTimeout(timer);
  }, [enabled, storageKey]);

  // Track target element position
  const updateTargetRect = useCallback(() => {
    const step = steps[currentStep];
    if (!step || !step.target) {
      setTargetRect(null);
      return;
    }

    const el = document.querySelector(`[data-tour="${step.target}"]`);
    if (el) {
      setTargetRect(el.getBoundingClientRect());
      retryRef.current = 0;
    } else if (retryRef.current < 5) {
      retryRef.current++;
      requestAnimationFrame(updateTargetRect);
    } else {
      setTargetRect(null);
      retryRef.current = 0;
    }
  }, [currentStep, steps]);

  useEffect(() => {
    if (!isActive) return;

    updateTargetRect();

    const handleResize = () => updateTargetRect();
    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleResize, true);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleResize, true);
    };
  }, [isActive, updateTargetRect]);

  const completeTour = useCallback(() => {
    setIsActive(false);
    localStorage.setItem(storageKey, 'true');
  }, [storageKey]);

  const nextStep = useCallback(() => {
    if (currentStep >= steps.length - 1) {
      completeTour();
    } else {
      setCurrentStep(prev => prev + 1);
    }
  }, [currentStep, steps.length, completeTour]);

  const prevStep = useCallback(() => {
    setCurrentStep(prev => Math.max(0, prev - 1));
  }, []);

  const skipTour = useCallback(() => {
    completeTour();
  }, [completeTour]);

  const restartTour = useCallback(() => {
    setCurrentStep(0);
    setIsActive(true);
  }, []);

  return {
    isActive,
    currentStep,
    totalSteps: steps.length,
    step: steps[currentStep] || steps[0],
    targetRect,
    nextStep,
    prevStep,
    skipTour,
    restartTour,
  };
}
