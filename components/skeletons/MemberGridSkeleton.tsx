export default function MemberGridSkeleton() {
  return (
    <div style={{ width: '100%' }}>
      {/* Header skeleton */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        marginBottom: '3rem'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '2rem',
          background: 'var(--bg-card)',
          borderRadius: '0.75rem',
          padding: '1.5rem',
          border: '3px solid #240059',
          width: '90%',
          maxWidth: '1200px'
        }}>
          <div className="skeleton" style={{ width: '180px', height: '48px' }} />
          <div className="skeleton" style={{ width: '200px', height: '2rem' }} />
          <div className="skeleton" style={{ width: '140px', height: '36px' }} />
        </div>
      </div>

      {/* Grid skeleton - 3 rank groups */}
      {[3, 6, 10].map((count, group) => (
        <div key={group} style={{ marginBottom: '3rem' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>
            <div className="skeleton" style={{ width: '120px', height: '1.5rem' }} />
          </div>
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '1rem',
            flexWrap: 'wrap'
          }}>
            {Array.from({ length: count }).map((_, i) => (
              <div key={i} className="skeleton" style={{
                width: '120px',
                height: '120px',
                borderRadius: '0.75rem'
              }} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
