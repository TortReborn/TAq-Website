'use client';

import Link from 'next/link';
import { useRef, useCallback, type ReactNode, type CSSProperties, type MouseEvent } from 'react';
import { preload } from 'swr';
import { fetcher } from '@/hooks/fetcher';

const routePrefetchMap: Record<string, string[]> = {
  '/members': ['/api/members'],
  '/leaderboard': ['/api/members/activity'],
  '/graid-event': ['/api/graid-event'],
  '/lootpools': ['/api/lootpools/lootruns', '/api/lootpools/aspects'],
};

interface NavLinkProps {
  href: string;
  children: ReactNode;
  style?: CSSProperties;
  onMouseEnter?: (e: MouseEvent<HTMLAnchorElement>) => void;
  onMouseLeave?: (e: MouseEvent<HTMLAnchorElement>) => void;
  onClick?: () => void;
}

export default function NavLink({ href, children, style, onMouseEnter, onMouseLeave, onClick }: NavLinkProps) {
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = useCallback((e: MouseEvent<HTMLAnchorElement>) => {
    onMouseEnter?.(e);

    const endpoints = routePrefetchMap[href];
    if (endpoints) {
      hoverTimerRef.current = setTimeout(() => {
        endpoints.forEach(url => preload(url, fetcher));
      }, 200);
    }
  }, [href, onMouseEnter]);

  const handleMouseLeave = useCallback((e: MouseEvent<HTMLAnchorElement>) => {
    onMouseLeave?.(e);
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  }, [onMouseLeave]);

  return (
    <Link
      href={href}
      style={style}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
    >
      {children}
    </Link>
  );
}
