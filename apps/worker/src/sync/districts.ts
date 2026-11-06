/**
 * District resolution by nearest district centre (spec §7 leaves the method to the builder).
 * Approximate near borders; admins can correct a place's district in the admin panel.
 */
const CENTRES: Record<string, Array<{ name: string; lat: number; lng: number }>> = {
  lviv: [
    { name: 'Галицький', lat: 49.841, lng: 24.031 },
    { name: 'Франківський', lat: 49.823, lng: 24.008 },
    { name: 'Залізничний', lat: 49.835, lng: 23.965 },
    { name: 'Шевченківський', lat: 49.865, lng: 24.01 },
    { name: 'Личаківський', lat: 49.835, lng: 24.07 },
    { name: 'Сихівський', lat: 49.795, lng: 24.05 },
  ],
};

export function districtOf(citySlug: string, lat: number, lng: number): string | null {
  const centres = CENTRES[citySlug];
  if (!centres) return null;
  const k = Math.cos((lat * Math.PI) / 180);
  let best: { name: string; d: number } | null = null;
  for (const c of centres) {
    const d = (c.lat - lat) ** 2 + ((c.lng - lng) * k) ** 2;
    if (!best || d < best.d) best = { name: c.name, d };
  }
  return best!.name;
}
