/** Returns a float in [0, 1). Injected so goal generation is deterministic in tests. */
export type Rng = () => number

/** Small seeded PRNG (mulberry32), for tests and reproducible runs. */
export function createSeededRng(seed: number): Rng {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
}
