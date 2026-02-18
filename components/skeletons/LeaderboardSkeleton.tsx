export default function LeaderboardSkeleton() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '2rem',
      minHeight: '100vh'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '900px',
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '2rem'
      }}>
        {/* Unified Header Skeleton */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          background: 'var(--bg-card)',
          borderRadius: '0.75rem',
          padding: '1.5rem',
          border: '3px solid #240059'
        }}>
          {/* Title */}
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <div className="skeleton" style={{ width: '220px', height: '2rem' }} />
          </div>
          {/* Controls row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {/* Time frame buttons */}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="skeleton" style={{
                  width: '80px',
                  height: '36px',
                  borderRadius: '0.5rem'
                }} />
              ))}
            </div>
            {/* Search + Refresh */}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <div className="skeleton" style={{ width: '180px', height: '36px', borderRadius: '0.5rem' }} />
              <div className="skeleton" style={{ width: '70px', height: '36px', borderRadius: '0.5rem' }} />
            </div>
          </div>
        </div>

        {/* Table Skeleton */}
        <div style={{
          background: 'var(--bg-card)',
          borderRadius: '0.75rem',
          border: '1px solid var(--border-card)',
          overflow: 'hidden'
        }}>
          {/* Header */}
          <div style={{
            padding: '0.75rem 1rem',
            display: 'flex',
            gap: '1rem',
            borderBottom: '2px solid var(--border-card)'
          }}>
            {[40, 120, 80, 60, 60, 60, 100, 80].map((w, i) => (
              <div key={i} className="skeleton" style={{ width: `${w}px`, height: '1rem' }} />
            ))}
          </div>
          {/* Rows */}
          {Array.from({ length: 15 }).map((_, i) => (
            <div key={i} style={{
              padding: '0.75rem 1rem',
              display: 'flex',
              gap: '1rem',
              borderBottom: '1px solid var(--border-card)'
            }}>
              {[40, 120, 80, 60, 60, 60, 100, 80].map((w, j) => (
                <div key={j} className="skeleton" style={{ width: `${w}px`, height: '1rem' }} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
