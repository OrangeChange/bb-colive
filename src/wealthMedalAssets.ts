/** Highest level whose image is currently bundled locally. */
export const MAX_BUNDLED_WEALTH_MEDAL_LEVEL = 80

/** Return the bundled local image path for a supported wealth level. */
export function getWealthMedalAssetPath(level: number | undefined): string | undefined {
  if (typeof level !== "number" || !Number.isInteger(level) || level < 1 || level > MAX_BUNDLED_WEALTH_MEDAL_LEVEL) {
    return undefined
  }

  const extension = level === MAX_BUNDLED_WEALTH_MEDAL_LEVEL ? "webp" : "png"
  return `/wealth-levels/${level}.${extension}`
}
