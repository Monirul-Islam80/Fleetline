/** Small seeded PRNG (mulberry32) so seed data is identical on every reset. */
export function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function pick<T>(items: readonly T[], rand: () => number): T {
  const item = items[Math.floor(rand() * items.length)];
  if (item === undefined) throw new Error("pick() called with an empty list");
  return item;
}

export const intBetween = (min: number, max: number, rand: () => number): number =>
  min + Math.floor(rand() * (max - min + 1));

let counter = 0;
/** Unique, sortable-enough id for client-side records. The real API will issue UUIDs. */
export function makeId(prefix: string): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}`;
}
