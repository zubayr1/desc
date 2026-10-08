/**
 * Hands out tiebreakers in turn. The counter lives in memory: after a restart it
 * starts again at the first, which only affects how evenly work spreads.
 */
export function roundRobin<T>(items: T[], key: (item: T) => string) {
  let next = 0;
  return {
    /** The next item not in `exclude`, or undefined if every one is excluded. */
    pick(exclude: Set<string>): T | undefined {
      for (let i = 0; i < items.length; i++) {
        const item = items[(next + i) % items.length];
        if (!exclude.has(key(item))) {
          next = (next + i + 1) % items.length;
          return item;
        }
      }
      return undefined;
    },
  };
}
