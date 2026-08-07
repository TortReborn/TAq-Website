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
          border: '3px solid var(--border-emphasis)',
          width: '90%',
          maxWidth: '1200px'
        }}>
          <div className="skeleton" style={{ width: '160px', height: '48px' }} />
          <div className="skeleton" style={{ width: '220px', height: '2.5rem' }} />
          <div className="skeleton" style={{ width: '180px', height: '36px', borderRadius: '0.5rem' }} />
        </div>
      </div>

      <div className="lootpools-window">
        <div className="lootpools-cycle-button lootpools-cycle-button--skeleton" aria-hidden="true" />
        <div className="lootpools-grid-container lootpools-grid-container--windowed lootpool-skeleton-grid">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="lootpool-card lootpool-skeleton-card">
              <div className="skeleton lootpool-skeleton-image" />
              <div className="skeleton lootpool-skeleton-title" />
              <div className="lootpool-entry-list">
                {[1, 2, 3, 4, 5].map(j => (
                  <div key={j} className="skeleton lootpool-skeleton-entry" />
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="lootpools-cycle-button lootpools-cycle-button--skeleton" aria-hidden="true" />
      </div>
    </div>
  );
}
