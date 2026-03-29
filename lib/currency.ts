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
    // 1+ LE — show as STX (stacks of 64 LE) when applicable
    const le = Math.ceil(payout / EM_PER_LE);
    const stx = Math.floor(le / 64);
    const remainder = le % 64;
    if (stx > 0) {
      return remainder > 0 ? `${stx} STX ${remainder} LE` : `${stx} STX`;
    }
    return `${le} LE`;
  }
}
