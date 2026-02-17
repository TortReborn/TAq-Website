"use client";

import { Suspense } from 'react';
import ApplicationForm from '@/components/ApplicationForm';
import { GUILD_QUESTIONS } from '@/lib/application-questions';

export default function GuildApplicationPage() {
  return (
    <Suspense fallback={
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <div style={{
          width: '40px',
          height: '40px',
          border: '3px solid var(--border-color)',
          borderTopColor: 'var(--accent-primary)',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    }>
      <ApplicationForm
        applicationType="guild"
        questions={GUILD_QUESTIONS}
        title="Guild Member Application"
      />
    </Suspense>
  );
}
