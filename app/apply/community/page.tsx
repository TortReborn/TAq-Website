import { Suspense } from 'react';
import ApplicationForm from '@/components/ApplicationForm';
import { getLiveForm } from '@/lib/application-forms-db';

// Questions are edited at /exec/application-forms (TAQ-217); load them per request.
export const dynamic = 'force-dynamic';

export default async function CommunityApplicationPage() {
  const form = await getLiveForm('community');
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
        applicationType="community"
        questions={form.content.questions}
        title="Community Member Application"
      />
    </Suspense>
  );
}
