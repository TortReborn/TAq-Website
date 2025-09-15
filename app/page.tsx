import PageHeader from '@/components/PageHeader';

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
          <PageHeader
            title="The Aquarium"
            subtitle="Wynncraft's Premier Aquatic-Themed Guild"
          />
          <p style={{
            fontSize: '1.125rem',
            color: 'var(--text-secondary)',
            margin: 0
          }}>
            Use the navigation bar above to explore our guild resources, member statistics, and territory map.
          </p>
        </div>
      </main>
    </>
  );
}
