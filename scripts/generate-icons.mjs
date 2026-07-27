/**
 * Generates the app icons.
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

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')

/* ---------------------------------------------------------------- palette */

const BRASS = [0x9c, 0x6f, 0x31]
const PAPER = [0xfa, 0xf4, 0xe8]
const RULE = [0xc9, 0xa8, 0x80]
const RIBBON = [0xe0, 0xbd, 0x4a]

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

/* -------------------------------------------------------------- rasterize */

const SUPERSAMPLE = 3 // 3x3 per pixel, enough to keep the curved page edges smooth

function renderRgba(size) {
  const pixels = Buffer.alloc(size * size * 4)

  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let r = 0
      let g = 0
      let b = 0

      for (let sy = 0; sy < SUPERSAMPLE; sy += 1) {
        for (let sx = 0; sx < SUPERSAMPLE; sx += 1) {
          const x = ((px + (sx + 0.5) / SUPERSAMPLE) / size) * 100
          const y = ((py + (sy + 0.5) / SUPERSAMPLE) / size) * 100
          const [cr, cg, cb] = sample(x, y)
          r += cr
          g += cg
          b += cb
        }
      }

      const samples = SUPERSAMPLE * SUPERSAMPLE
      const offset = (py * size + px) * 4
      pixels[offset] = Math.round(r / samples)
      pixels[offset + 1] = Math.round(g / samples)
      pixels[offset + 2] = Math.round(b / samples)
      pixels[offset + 3] = 255
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

function encodePng(pixels, size) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // colour type: RGBA
  ihdr[10] = 0 // deflate
  ihdr[11] = 0 // adaptive filtering
  ihdr[12] = 0 // no interlace

  // Each scanline is prefixed with its filter byte (0 = None).
  const stride = size * 4
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

mkdirSync(OUT_DIR, { recursive: true })

for (const size of [180, 192, 512]) {
  const png = encodePng(renderRgba(size), size)
  const name = size === 180 ? 'apple-touch-icon.png' : `icon-${size}.png`
  writeFileSync(join(OUT_DIR, name), png)
  console.log(`${name.padEnd(22)} ${size}x${size}  ${(png.length / 1024).toFixed(1)} kB`)
}
