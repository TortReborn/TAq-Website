export default function LootpoolSkeleton() {
  return (
    <div style={{
      padding: '2rem',
      maxWidth: '1400px',
      margin: '0 auto',
      minHeight: '100vh'
    }}>
      {/* Header */}
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
          <div className="skeleton" style={{ width: '160px', height: '48px' }} />
          <div className="skeleton" style={{ width: '220px', height: '2.5rem' }} />
          <div className="skeleton" style={{ width: '180px', height: '36px', borderRadius: '0.5rem' }} />
        </div>
      </div>

      {/* Grid of 5 columns */}
      <div style={{
        display: 'flex',
        justifyContent: 'center'
      }}>
        <div className="lootpools-grid-container lootpools-grid-5" style={{
          width: '90%',
          maxWidth: '1200px'
        }}>
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} style={{
              background: 'var(--bg-card)',
              borderRadius: '1rem',
              padding: '1.5rem',
              border: '3px solid #240059'
            }}>
              <div className="skeleton" style={{
                width: '120px',
                height: '120px',
                borderRadius: '0.5rem',
                margin: '0 auto 1rem'
              }} />
              <div className="skeleton" style={{
                width: '80%',
                height: '1.25rem',
                margin: '0 auto 1rem'
              }} />
              {[1, 2, 3].map(j => (
                <div key={j} className="skeleton" style={{
                  height: '2.5rem',
                  marginBottom: '0.5rem',
                  borderRadius: '0.5rem'
                }} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
