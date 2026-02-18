export async function fetcher(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    if (response.status === 429) {
      const errorData = await response.json();
      throw new Error(`Rate limit exceeded. ${errorData.message || 'Please try again later.'}`);
    }
    throw new Error(`HTTP ${response.status}: Failed to fetch data`);
  }
  return response.json();
}
