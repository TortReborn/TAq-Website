export default function HomePage() {
  return (
    <>
      <main style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        padding: '1rem'
      }}>
        <div style={{
          maxWidth: '32rem',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          gap: '2rem'
        }}>
          <h1 style={{
            fontSize: '3rem',
            fontWeight: '900',
            color: 'var(--text-primary)',
            margin: 0
          }}>
            Welcome to The Aquarium Guild Website
          </h1>
          <p style={{
            fontSize: '1.125rem',
            color: 'var(--text-secondary)',
            margin: 0
          }}>
            This is the homepage. Use the navigation bar above to visit subpages like the{' '}
            <a 
              href="/graid-event" 
              style={{
                color: 'var(--text-link)',
                textDecoration: 'underline',
                fontWeight: '600'
              }}
            >
              Graid Event
            </a>{' '}
            page.
          </p>
        </div>
      </main>
    </>
  );
}
