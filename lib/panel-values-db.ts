/** Server side of panel values (lib/panel-values.ts): their current settings. */

import { getShellConversion } from '@/lib/shell-conversion';

export async function getPanelValues(): Promise<Record<string, string>> {
  const conversion = await getShellConversion();
  return {
    shells_per_aspect: String(conversion.shells_per_aspect),
    max_aspects_per_conversion: String(conversion.max_aspects_per_conversion),
  };
}
