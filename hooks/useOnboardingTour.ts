"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import TOUR_STEPS from '@/lib/onboarding-steps';
import type { TourStep } from '@/lib/onboarding-steps';

export type { TourStep };

// TODO: Re-enable localStorage after finalizing onboarding text
// const STORAGE_KEY = 'exec_onboarding_complete';

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

export function useOnboardingTour(enabled: boolean): OnboardingTourState {
  const [isActive, setIsActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const retryRef = useRef<number>(0);

  // Auto-start — localStorage disabled for testing, always shows
  useEffect(() => {
    if (!enabled) return;

    const timer = setTimeout(() => {
      setIsActive(true);
      setCurrentStep(0);
    }, 600);

    return () => clearTimeout(timer);
  }, [enabled]);

  // Track target element position
  const updateTargetRect = useCallback(() => {
    const step = TOUR_STEPS[currentStep];
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
  }, [currentStep]);

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
    // TODO: Re-enable after finalizing onboarding text
    // localStorage.setItem(STORAGE_KEY, 'true');
  }, []);

  const nextStep = useCallback(() => {
    if (currentStep >= TOUR_STEPS.length - 1) {
      completeTour();
    } else {
      setCurrentStep(prev => prev + 1);
    }
  }, [currentStep, completeTour]);

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
    totalSteps: TOUR_STEPS.length,
    step: TOUR_STEPS[currentStep] || TOUR_STEPS[0],
    targetRect,
    nextStep,
    prevStep,
    skipTour,
    restartTour,
  };
}
