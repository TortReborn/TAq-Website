export default function HomePage() {
  return (
    <>
      <main className="flex flex-col items-center justify-center min-h-screen px-4">
        <div className="max-w-2xl w-full flex flex-col items-center text-center gap-8">
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-ocean-900">
            Welcome to The Aquarium Guild Website
          </h1>
          <p className="text-lg text-ocean-800/90">
            This is the homepage. Use the navigation bar above to visit subpages like the <a href="/graid-event" className="text-ocean-700 underline font-semibold">Graid Event</a> page.
          </p>
        </div>
      </main>
    </>
  );
}
