'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Replays the page-fade-in animation on route changes.
 *
 * Same-section changes within /map are deliberately skipped: the map page
 * rewrites its URL with history.replaceState as its mode/layer state changes
 * (live/history/chronicle/factions) while the component stays mounted.
 * Next intercepts replaceState and updates usePathname(), and replaying the
 * animation would both flash the page and — because the keyframe's transform
 * makes this wrapper a containing block — briefly re-anchor the map's
 * position: fixed viewport, visibly collapsing the layout mid-switch.
 */
export default function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const prevPathRef = useRef(pathname);

  useEffect(() => {
    const prev = prevPathRef.current;
    prevPathRef.current = pathname;
    if (prev === pathname) return;
    if (prev.startsWith('/map') && pathname.startsWith('/map')) return;
    if (wrapperRef.current) {
      wrapperRef.current.style.animation = 'none';
      // Force reflow to restart animation
      wrapperRef.current.offsetHeight;
      wrapperRef.current.style.animation = '';
    }
  }, [pathname]);

  return (
    <div ref={wrapperRef} className="page-transition-wrapper">
      {children}
    </div>
  );
}
