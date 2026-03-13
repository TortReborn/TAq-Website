"use client";

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function ExecLoginRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/login'); }, [router]);
  return null;
}
