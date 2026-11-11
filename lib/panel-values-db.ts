/** Server side of panel values (lib/panel-values.ts): their current settings. */

import { getShellConversion } from '@/lib/shell-conversion';
import { queueText } from '@/lib/tomes';
import { getOpenRequests } from '@/lib/tomes-db';

export async function getPanelValues(): Promise<Record<string, string>> {
  const [conversion, requests] = await Promise.all([getShellConversion(), getOpenRequests()]);
  return {
    shells_per_aspect: String(conversion.shells_per_aspect),
    max_aspects_per_conversion: String(conversion.max_aspects_per_conversion),
    tome_queue: queueText(requests),
  };
}
