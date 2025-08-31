// Converts a payout number to EM/EB/LE string
export function formatPayout(payout: number): string {
  const EM_PER_EB = 64;
  const EB_PER_LE = 64;
  const EM_PER_LE = EM_PER_EB * EB_PER_LE;

  if (payout < EM_PER_EB) {
    // 1-63 EM
    return `${payout} EM`;
  } else if (payout < EM_PER_LE) {
    // 1-63.99 EB
    const eb = Math.round((payout / EM_PER_EB) * 10) / 10;
    return `${eb % 1 === 0 ? eb.toFixed(0) : eb.toFixed(1)} EB`;
  } else {
    // 1+ LE
    const le = Math.round((payout / EM_PER_LE) * 10) / 10;
    return `${le % 1 === 0 ? le.toFixed(0) : le.toFixed(1)} LE`;
  }
}
