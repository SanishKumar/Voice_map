/**
 * Helpers shared by the catalog builders.
 *
 * Both builders face the same two problems: a compiled plan must be
 * invalidated when the schema behind it changes, and a machine-readable id
 * makes a poor thing to say out loud.
 *
 * @module adapters/catalogUtils
 */

/** Small stable hash so a schema change invalidates previously compiled plans. */
export function fingerprint(value) {
  let hash = 0x811c9dc5;
  const text = JSON.stringify(value);
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

/** "dutch_windmills" should also answer to "dutch windmills". */
export function aliasesFor(id, title) {
  const candidates = new Set();
  const spaced = String(id).replace(/[_-]+/g, ' ').trim();
  if (spaced && spaced !== id) candidates.add(spaced);
  if (title && title !== id) candidates.add(String(title).trim());
  return [...candidates].filter(Boolean);
}

/**
 * Keep aliases unique across a catalog.
 *
 * SpatialCatalog rejects a name two layers both answer to, so an alias that
 * would collide is dropped rather than allowed to make the catalog throw.
 * Dropping it costs one phrasing; keeping it would cost the whole catalog.
 *
 * @param {Set<string>} claimed - Lowercased names already spoken for; mutated.
 * @param {string[]} aliases
 * @returns {string[]}
 */
export function claimAliases(claimed, aliases) {
  return aliases.filter((alias) => {
    const key = alias.toLowerCase();
    if (claimed.has(key)) return false;
    claimed.add(key);
    return true;
  });
}
