"use client";

import { useEffect, useRef, useState } from "react";

interface AnimatedCounterProps {
  value: number | null; // pass null while loading
  duration?: number; // ms
  formatter?: (n: number) => string;
  className?: string;
  prefix?: string;
  suffix?: string;
  loadingPlaceholder?: string;
}

const defaultFormatter = (n: number) => Math.round(n).toLocaleString("en-US");

// Counts up from 0 to `value` once scrolled into view, then holds.
export default function AnimatedCounter({
  value,
  duration = 1800,
  formatter = defaultFormatter,
  className,
  prefix = "",
  suffix = "",
  loadingPlaceholder = "—",
}: AnimatedCounterProps) {
  const [display, setDisplay] = useState(0);
  const hasAnimatedRef = useRef(false);
  const elementRef = useRef<HTMLSpanElement>(null);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const el = elementRef.current;
    if (!el || value === null || hasAnimatedRef.current) return;

    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const runAnimation = () => {
      hasAnimatedRef.current = true;

      if (prefersReducedMotion) {
        setDisplay(value);
        return;
      }

      const start = performance.now();

      const tick = (now: number) => {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
        setDisplay(value * eased);
        if (progress < 1) {
          frameRef.current = requestAnimationFrame(tick);
        } else {
          setDisplay(value);
        }
      };

      frameRef.current = requestAnimationFrame(tick);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          observer.disconnect();
          runAnimation();
        }
      },
      { threshold: 0.3 }
    );

    observer.observe(el);
    return () => {
      observer.disconnect();
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [value, duration]);

  return (
    <span ref={elementRef} className={className}>
      {value === null ? loadingPlaceholder : `${prefix}${formatter(display)}${suffix}`}
    </span>
  );
}
