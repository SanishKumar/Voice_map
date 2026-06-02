/**
 * fuzzyMatch.js
 * Levenshtein distance implementation and fuzzy string matching utilities.
 *
 * Used for fault-tolerant voice command parsing:
 *   - "sattelite" → "satellite" → nasa layer
 *   - "Ahmdabad" → "Ahmedabad" → known city
 *   - "zoon in" → "zoom in" → ZOOM_IN intent
 *
 * @module parser/fuzzyMatch
 */

/**
 * Compute the Levenshtein edit distance between two strings.
 * Uses the Wagner–Fischer dynamic programming algorithm.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number} Edit distance (0 = exact match)
 */
export function levenshtein(a, b) {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Optimize: short-circuit if one is a single char
  const la = a.length;
  const lb = b.length;

  // Use a single-row DP array for space efficiency
  const row = new Array(lb + 1);
  for (let j = 0; j <= lb; j++) row[j] = j;

  for (let i = 1; i <= la; i++) {
    let prev = i;
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const val = Math.min(
        row[j] + 1,        // deletion
        prev + 1,          // insertion
        row[j - 1] + cost  // substitution
      );
      row[j - 1] = prev;
      prev = val;
    }
    row[lb] = prev;
  }

  return row[lb];
}

/**
 * Find the best fuzzy match from a list of candidates.
 *
 * @param {string} input         - The input string to match
 * @param {string[]} candidates  - List of candidate strings
 * @param {object} [options]
 * @param {number} [options.maxDistance=2]  - Maximum allowed edit distance
 * @param {number} [options.threshold=0.6] - Minimum similarity score (0-1) to accept
 * @returns {{ match: string, distance: number, score: number }|null}
 */
export function fuzzyMatch(input, candidates, options = {}) {
  const maxDistance = options.maxDistance ?? 2;
  const threshold = options.threshold ?? 0.6;

  if (!input || !candidates || candidates.length === 0) return null;

  const inputLower = input.toLowerCase().trim();
  let bestMatch = null;
  let bestDistance = Infinity;
  let bestScore = 0;

  for (const candidate of candidates) {
    const candidateLower = candidate.toLowerCase().trim();
    const distance = levenshtein(inputLower, candidateLower);
    const maxLen = Math.max(inputLower.length, candidateLower.length);
    const score = maxLen === 0 ? 1 : 1 - distance / maxLen;

    if (distance <= maxDistance && score >= threshold && distance < bestDistance) {
      bestMatch = candidate;
      bestDistance = distance;
      bestScore = score;
    }
  }

  if (bestMatch === null) return null;

  return {
    match: bestMatch,
    distance: bestDistance,
    score: bestScore,
  };
}

/**
 * Fuzzy-resolve a layer alias against known layer aliases.
 *
 * @param {string} input    - User's spoken layer name (may contain typos)
 * @param {object} aliases  - Map of alias → canonical layer id
 * @returns {{ layerId: string, alias: string, fuzzy: boolean, score: number }|null}
 */
export function fuzzyResolveLayer(input, aliases) {
  if (!input) return null;
  const key = input.toLowerCase().trim();

  // Exact match first
  if (aliases[key]) {
    return { layerId: aliases[key], alias: key, fuzzy: false, score: 1 };
  }

  // Fuzzy match against all alias keys
  const aliasKeys = Object.keys(aliases);
  const result = fuzzyMatch(key, aliasKeys, { maxDistance: 2, threshold: 0.65 });

  if (result) {
    return {
      layerId: aliases[result.match],
      alias: result.match,
      fuzzy: true,
      score: result.score,
    };
  }

  return null;
}

/**
 * Fuzzy-resolve a city name against known city coordinates.
 *
 * @param {string} input       - User's spoken city name (may contain typos)
 * @param {object} cityCoords  - Map of city name → [lat, lng]
 * @returns {{ name: string, coords: [number, number], fuzzy: boolean, score: number }|null}
 */
export function fuzzyResolveCity(input, cityCoords) {
  if (!input) return null;
  const key = input.toLowerCase().trim();

  // Exact match first
  if (cityCoords[key]) {
    return { name: key, coords: cityCoords[key], fuzzy: false, score: 1 };
  }

  // Fuzzy match against all city names
  const cityNames = Object.keys(cityCoords);
  const result = fuzzyMatch(key, cityNames, { maxDistance: 2, threshold: 0.6 });

  if (result) {
    return {
      name: result.match,
      coords: cityCoords[result.match],
      fuzzy: true,
      score: result.score,
    };
  }

  return null;
}
