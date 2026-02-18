export default function EventSkeleton() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      paddingTop: '2rem',
      paddingLeft: '1rem',
      paddingRight: '1rem'
    }}>
      <div style={{
        maxWidth: '48rem',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '1.5rem'
      }}>
        {/* Event info card */}
        <div style={{
          width: '100%',
          padding: '1.5rem',
          textAlign: 'center',
          background: 'var(--bg-card)',
          borderRadius: '1rem',
          border: '3px solid #240059'
        }}>
          <div className="skeleton" style={{ width: '220px', height: '2rem', margin: '0 auto 1rem' }} />
          <div className="skeleton" style={{ width: '300px', height: '1rem', margin: '0 auto 0.5rem' }} />
          <div className="skeleton" style={{ width: '250px', height: '1rem', margin: '0 auto 0.5rem' }} />
          <div className="skeleton" style={{ width: '200px', height: '1rem', margin: '0 auto' }} />
        </div>

        {/* Table */}
        <div style={{
          width: '100%',
          border: '3px solid #240059',
          borderRadius: '1rem',
          overflow: 'hidden'
        }}>
          {/* Header */}
          <div style={{
            padding: '0.75rem 1rem',
            display: 'flex',
            gap: '1rem',
            borderBottom: '2px solid var(--border-card)'
          }}>
            {[40, 120, 60, 80, 80].map((w, i) => (
              <div key={i} className="skeleton" style={{ width: `${w}px`, height: '1rem' }} />
            ))}
          </div>
          {/* Rows */}
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} style={{
              padding: '0.75rem 1rem',
              display: 'flex',
              gap: '1rem',
              borderBottom: '1px solid var(--border-card)'
            }}>
              {[40, 120, 60, 80, 80].map((w, j) => (
                <div key={j} className="skeleton" style={{ width: `${w}px`, height: '1rem' }} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
