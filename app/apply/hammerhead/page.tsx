"use client";

import { Suspense } from 'react';
import HammerheadApplicationForm from '@/components/HammerheadApplicationForm';

export default function HammerheadApplicationPage() {
  return (
    <Suspense fallback={
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <div style={{
          width: '40px',
          height: '40px',
          border: '3px solid var(--border-color)',
          borderTopColor: '#396aff',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    }>
      <HammerheadApplicationForm />
    </Suspense>
  );
}
