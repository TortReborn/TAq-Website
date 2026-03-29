export const ANALYTICS_DISCORD_ID = '170719819715313665';

export function isAnalyticsUser(discordId: string): boolean {
  return discordId === ANALYTICS_DISCORD_ID;
}
