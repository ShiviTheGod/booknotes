/**
 * Generates the app icons and the iOS launch image.
 *
 * Written as a script rather than committing opaque binaries so the icon can be
 * adjusted and regenerated: change the colours or geometry below and re-run
 * `node scripts/generate-icons.mjs`.
 *
 * Uses only Node built-ins — the shapes are rasterized by hand and encoded as PNG
 * with zlib. Pulling in a canvas or image library for one static icon would be a
 * heavy build dependency for very little.
 */

import { deflateSync, crc32 } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const WEB_DIR = join(ROOT, 'public')
const ICON_SET = join(ROOT, 'ios', 'App', 'App', 'Assets.xcassets', 'AppIcon.appiconset')
const SPLASH_SET = join(ROOT, 'ios', 'App', 'App', 'Assets.xcassets', 'Splash.imageset')

/* ---------------------------------------------------------------- palette */

const BRASS = [0x9c, 0x6f, 0x31]
const PAPER = [0xfa, 0xf4, 0xe8]
const RULE = [0xc9, 0xa8, 0x80]
const RIBBON = [0xe0, 0xbd, 0x4a]

/** --c-paper, and the same value as `backgroundColor` in capacitor.config.ts, so
 *  the launch image and the web view behind it are literally the same colour and
 *  the hand-off between them is invisible. */
const PAPER_BG = [0xf5, 0xef, 0xe3]

/* --------------------------------------------------------------- geometry */
/* All shapes are defined in a 0-100 space and scaled to the output size. */

/** Fit y = ax^2 + bx + c through three points, so a page edge can curve. */
function parabola([x1, y1], [x2, y2], [x3, y3]) {
  const d = (x1 - x2) * (x1 - x3) * (x2 - x3)
  const a = (x3 * (y2 - y1) + x2 * (y1 - y3) + x1 * (y3 - y2)) / d
  const b = (x3 * x3 * (y1 - y2) + x2 * x2 * (y3 - y1) + x1 * x1 * (y2 - y3)) / d
  const c =
    (x2 * x3 * (x2 - x3) * y1 + x3 * x1 * (x3 - x1) * y2 + x1 * x2 * (x1 - x2) * y3) / d
  return (x) => a * x * x + b * x + c
}

const leftTop = parabola([18, 28], [33.5, 25.5], [48, 30])
const leftBottom = parabola([18, 72], [33.5, 69.5], [48, 74])
const rightTop = parabola([52, 30], [66.5, 25.5], [82, 28])
const rightBottom = parabola([52, 74], [66.5, 69.5], [82, 72])

function inLeftPage(x, y) {
  return x >= 18 && x <= 48 && y >= leftTop(x) && y <= leftBottom(x)
}

function inRightPage(x, y) {
  return x >= 52 && x <= 82 && y >= rightTop(x) && y <= rightBottom(x)
}

/** Distance from a point to a line segment — used for the ruled lines. */
function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax
  const dy = by - ay
  const lengthSquared = dx * dx + dy * dy
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared))
  const cx = ax + t * dx
  const cy = ay + t * dy
  return Math.hypot(px - cx, py - cy)
}

const RULED_LINES = []
for (let i = 0; i < 3; i += 1) {
  const y = 39 + i * 10
  RULED_LINES.push([25, y, 43, y + 1.5])
  RULED_LINES.push([57, y + 1.5, 75, y])
}

function onRuledLine(x, y) {
  return RULED_LINES.some((segment) => distanceToSegment(x, y, ...segment) < 1)
}

const RIBBON_POLY = [
  [46, 20],
  [54, 20],
  [54, 44],
  [50, 39],
  [46, 44],
]

function inPolygon(x, y, poly) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

/** Colour at a point, or null for background. */
function sample(x, y) {
  if (inPolygon(x, y, RIBBON_POLY)) return RIBBON
  if (inLeftPage(x, y) || inRightPage(x, y)) {
    return onRuledLine(x, y) ? RULE : PAPER
  }
  return BRASS
}

/* ------------------------------------------------------------ launch image */

/* The same emblem again, shrunk into a rounded tile on a paper field. Repeating the
 * icon rather than inventing a second piece of artwork is the point: the tile the
 * finger just tapped stays on screen while the web view boots, so the launch reads
 * as the app opening rather than as a separate loading screen. */

const TILE_MIN = 35
const TILE_MAX = 65
/* 22% of the tile's width — the proportion iOS uses to round an app icon, so the
 * shape matches the one on the Home Screen. */
const TILE_RADIUS = (TILE_MAX - TILE_MIN) * 0.22

function inRoundedTile(x, y) {
  if (x < TILE_MIN || x > TILE_MAX || y < TILE_MIN || y > TILE_MAX) return false

  const insetMin = TILE_MIN + TILE_RADIUS
  const insetMax = TILE_MAX - TILE_RADIUS
  const cornerX = x < insetMin ? insetMin : x > insetMax ? insetMax : null
  const cornerY = y < insetMin ? insetMin : y > insetMax ? insetMax : null
  if (cornerX === null || cornerY === null) return true

  return Math.hypot(x - cornerX, y - cornerY) <= TILE_RADIUS
}

function sampleSplash(x, y) {
  if (!inRoundedTile(x, y)) return PAPER_BG

  const scale = 100 / (TILE_MAX - TILE_MIN)
  return sample((x - TILE_MIN) * scale, (y - TILE_MIN) * scale)
}

/* -------------------------------------------------------------- rasterize */

const SUPERSAMPLE = 3 // 3x3 per pixel, enough to keep the curved page edges smooth

/** `channels` is 4 for RGBA or 3 for RGB; every pixel is opaque either way. */
function render(size, sampleAt, channels) {
  const pixels = Buffer.alloc(size * size * channels)

  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let r = 0
      let g = 0
      let b = 0

      for (let sy = 0; sy < SUPERSAMPLE; sy += 1) {
        for (let sx = 0; sx < SUPERSAMPLE; sx += 1) {
          const x = ((px + (sx + 0.5) / SUPERSAMPLE) / size) * 100
          const y = ((py + (sy + 0.5) / SUPERSAMPLE) / size) * 100
          const [cr, cg, cb] = sampleAt(x, y)
          r += cr
          g += cg
          b += cb
        }
      }

      const samples = SUPERSAMPLE * SUPERSAMPLE
      const offset = (py * size + px) * channels
      pixels[offset] = Math.round(r / samples)
      pixels[offset + 1] = Math.round(g / samples)
      pixels[offset + 2] = Math.round(b / samples)
      if (channels === 4) pixels[offset + 3] = 255
    }
  }

  return pixels
}

/* ------------------------------------------------------------ PNG encoding */

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)

  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data])

  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE(crc32(typeAndData) >>> 0)

  return Buffer.concat([length, typeAndData, checksum])
}

function encodePng(pixels, size, channels) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = channels === 4 ? 6 : 2 // colour type: RGBA or RGB
  ihdr[10] = 0 // deflate
  ihdr[11] = 0 // adaptive filtering
  ihdr[12] = 0 // no interlace

  // Each scanline is prefixed with its filter byte (0 = None).
  const stride = size * channels
  const raw = Buffer.alloc((stride + 1) * size)
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/* -------------------------------------------------------------------- run */

function write(dir, name, png, size) {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, name), png)
  console.log(`${name.padEnd(24)} ${`${size}x${size}`.padEnd(11)} ${(png.length / 1024).toFixed(1)} kB`)
}

for (const size of [180, 192, 512]) {
  const name = size === 180 ? 'apple-touch-icon.png' : `icon-${size}.png`
  write(WEB_DIR, name, encodePng(render(size, sample, 4), size, 4), size)
}

/* RGB rather than RGBA, and not because of the file size: an alpha channel on an iOS
 * app icon is composited against black, which turns the rounded corners into dark
 * fringing, and it is grounds for rejection if this ever goes near the App Store. */
write(ICON_SET, 'AppIcon-512@2x.png', encodePng(render(1024, sample, 3), 1024, 3), 1024)

/* One image, written three times, because the asset catalogue declares 1x/2x/3x and
 * Xcode will not build with a slot left empty. At 2732 square it covers any device in
 * either orientation, so the three really are the same picture. */
const splash = encodePng(render(2732, sampleSplash, 3), 2732, 3)
for (const name of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
  write(SPLASH_SET, name, splash, 2732)
}
