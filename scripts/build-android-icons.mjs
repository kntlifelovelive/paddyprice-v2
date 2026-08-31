#!/usr/bin/env node
/**
 * Build Android launcher icons from the existing project JPG (icon_source.jpg).
 *
 * - Preserves the original visual identity (no redesign).
 * - Square-centre-crops the JPG and resizes it to all required Android densities.
 * - Generates BOTH the legacy ic_launcher.png / ic_launcher_round.png
 *   AND the adaptive-icon foreground (ic_launcher_foreground.png) using the
 *   adaptive safe zone (66dp out of 108dp).
 * - Picks a background colour sampled from the JPG so the adaptive icon's
 *   background blends with the existing artwork instead of being a hard
 *   placeholder.
 *
 * No external network, no new icon design — the source is icon_source.jpg.
 */
import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(__dirname, '..')

const SOURCE = join(projectRoot, 'icon_source.jpg')
const RES = join(projectRoot, 'android', 'app', 'src', 'main', 'res')

if (!existsSync(SOURCE)) {
  console.error(`Source icon not found: ${SOURCE}`)
  process.exit(1)
}

// Legacy launcher icon sizes (px, square).
const LEGACY_SIZES = {
  mdpi: 48,
  hdpi: 72,
  xhdpi: 96,
  xxhdpi: 144,
  xxxhdpi: 192,
}

// Adaptive foreground sizes (px, square). Android draws the 108dp canvas and
// masks/insets to the 66dp safe zone, so we render the source at 432px and
// let the system centre-and-crop it.  We still keep the source aspect
// ratio by centring a square crop.
const FG_SIZES = {
  mdpi: 108,
  hdpi: 162,
  xhdpi: 216,
  xxhdpi: 324,
  xxxhdpi: 432,
}

function magick(args) {
  return execSync(`magick ${args}`, { stdio: ['ignore', 'pipe', 'pipe'] })
}

// 1. Sample the centre colour from the JPG to use as the adaptive background.
const sampled = magick(
  `convert "${SOURCE}" -gravity center -crop 1:1 +repage -resize 1x1 txt:-`,
)
  .toString()
  .trim()
const hexMatch = sampled.match(/#[0-9A-Fa-f]{6,8}/)
if (!hexMatch) {
  console.error('Could not sample background colour from icon_source.jpg')
  process.exit(1)
}
const backgroundHex = hexMatch[0].toUpperCase()
console.log(`[icons] sampled background colour: ${backgroundHex}`)

// 2. Centre-crop the JPG to a square once at the largest size, then use it
//    for all the smaller outputs.  Doing it once is faster and ensures
//    every density gets the SAME visual crop.
const masterSquareSize = Math.max(...Object.values(LEGACY_SIZES), ...Object.values(FG_SIZES))
const masterPath = '/tmp/paddy-icon-master.png'
magick(
  `convert "${SOURCE}" -gravity center -crop 1:1 +repage -resize ${masterSquareSize}x${masterSquareSize} "${masterPath}"`,
)
console.log(`[icons] wrote master square: ${masterPath} (${masterSquareSize}px)`)

// 3. Write the legacy square launcher icons (ic_launcher.png and round).
for (const [dpi, size] of Object.entries(LEGACY_SIZES)) {
  const dir = join(RES, `mipmap-${dpi}`)
  mkdirSync(dir, { recursive: true })
  const outSquare = join(dir, 'ic_launcher.png')
  const outRound = join(dir, 'ic_launcher_round.png')
  magick(`convert "${masterPath}" -resize ${size}x${size} "${outSquare}"`)
  // The round icon is a circular alpha-mask of the same artwork.
  magick(
    `convert "${masterPath}" -resize ${size}x${size} \\( -size ${size}x${size} xc:none -fill white -draw "circle ${size / 2},${size / 2} ${size / 2},0" \\) -alpha set -compose DstIn -composite "${outRound}"`,
  )
  console.log(`[icons] mipmap-${dpi}: ic_launcher.png (${size}px), ic_launcher_round.png`)
}

// 4. Write the adaptive-icon foreground at each density.
for (const [dpi, size] of Object.entries(FG_SIZES)) {
  const dir = join(RES, `mipmap-${dpi}`)
  mkdirSync(dir, { recursive: true })
  const out = join(dir, 'ic_launcher_foreground.png')
  magick(`convert "${masterPath}" -resize ${size}x${size} "${out}"`)
  console.log(`[icons] mipmap-${dpi}: ic_launcher_foreground.png (${size}px)`)
}

// 5. Update the adaptive background colour (values/ic_launcher_background.xml).
const bgPath = join(RES, 'values', 'ic_launcher_background.xml')
mkdirSync(dirname(bgPath), { recursive: true })
writeFileSync(
  bgPath,
  `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">${backgroundHex}</color>
</resources>
`,
)
console.log(`[icons] wrote ${bgPath}`)

console.log('[icons] done.')
