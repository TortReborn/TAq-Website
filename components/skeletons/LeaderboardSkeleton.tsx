export default function LeaderboardSkeleton() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      paddingTop: '5rem',
      paddingLeft: 'clamp(1rem, 5vw, 3rem)',
      paddingRight: 'clamp(1rem, 5vw, 3rem)',
      paddingBottom: '2rem'
    }}>
      <div style={{
        width: '60%',
        maxWidth: '1400px',
        display: 'flex',
        flexDirection: 'column',
        gap: '2rem'
      }}>
        {/* Title */}
        <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
          <div className="skeleton" style={{ width: '280px', height: '2.5rem', margin: '0 auto' }} />
        </div>

        {/* Time frame buttons */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          gap: '0.5rem',
          marginBottom: '1rem'
        }}>
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="skeleton" style={{
              width: '80px',
              height: '36px',
              borderRadius: '0.5rem'
            }} />
          ))}
        </div>

        {/* Table */}
        <div style={{
          background: 'var(--bg-card)',
          borderRadius: '0.75rem',
          border: '3px solid #240059',
          overflow: 'hidden'
        }}>
          {/* Header */}
          <div style={{
            padding: '0.75rem 1rem',
            display: 'flex',
            gap: '1rem',
            borderBottom: '2px solid var(--border-card)'
          }}>
            {[40, 120, 80, 60, 60, 60, 80].map((w, i) => (
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
              {[40, 120, 80, 60, 60, 60, 80].map((w, j) => (
                <div key={j} className="skeleton" style={{ width: `${w}px`, height: '1rem' }} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
