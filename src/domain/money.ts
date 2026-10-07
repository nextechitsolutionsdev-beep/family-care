export type WeightedAmount = { id: string; weight: bigint };
const ceiling = 9_000_000_000_000n;
export function minor(value: string): number {
  const text = value.trim().replaceAll(',', '');
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) throw new Error('اكتب مبلغاً صحيحاً بحد أقصى رقمين بعد العلامة.');
  const [whole, fraction = ''] = text.split('.');
  const amount = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (amount > ceiling) throw new Error('المبلغ أكبر من الحد المسموح.');
  return Number(amount);
}
export function percent(value: string): number {
  const bps = minor(value);
  if (bps > 10000) throw new Error('النسبة من 0 إلى 100.');
  return bps;
}
export function roundShare(amount: bigint, bps: number): bigint {
  if (amount < 0n || !Number.isInteger(bps) || bps < 0 || bps > 10000) throw new Error('Invalid share');
  return (amount * BigInt(bps) + 5000n) / 10000n;
}
export function split(amount: bigint, bps: number) {
  const patient = roundShare(amount, bps);
  return { patient, covered: amount - patient };
}
export function allocate(amount: bigint, entries: WeightedAmount[]): WeightedAmount[] {
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0n);
  if (amount < 0n || entries.some(entry => entry.weight < 0n) || (total === 0n && amount !== 0n)) throw new Error('Invalid allocation');
  if (total === 0n) return entries.map(entry => ({ ...entry, weight: 0n }));
  const ranked = entries.map(entry => ({ ...entry, base: amount * entry.weight / total, remainder: amount * entry.weight % total }))
    .sort((a, b) => a.remainder === b.remainder ? a.id.localeCompare(b.id, 'en') : a.remainder > b.remainder ? -1 : 1);
  let remaining = amount - ranked.reduce((sum, entry) => sum + entry.base, 0n);
  const values = new Map(ranked.map(entry => {
    const extra = remaining > 0n ? 1n : 0n;
    remaining -= extra;
    return [entry.id, entry.base + extra];
  }));
  return entries.map(entry => ({ id: entry.id, weight: values.get(entry.id) ?? 0n }));
}
export function decimal(value: unknown): string {
  const amount = BigInt(String(value ?? 0));
  const sign = amount < 0 ? '-' : '';
  const absolute = amount < 0 ? -amount : amount;
  return `${sign}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
}
export function money(value: unknown): string {
  const [whole, fraction] = decimal(value).split('.');
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${fraction === '00' ? '' : '.' + fraction} جنيه`;
}
