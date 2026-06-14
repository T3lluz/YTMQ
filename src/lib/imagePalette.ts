export type ImagePalette = {
  accent: string
  accentRgb: [number, number, number]
  accentLight: string
  accentMuted: string
  accentSoft: string
}

export const DEFAULT_IMAGE_PALETTE: ImagePalette = {
  accent: '#8b5cf6',
  accentRgb: [139, 92, 246],
  accentLight: '#a78bfa',
  accentMuted: 'rgba(139, 92, 246, 0.22)',
  accentSoft: 'rgba(139, 92, 246, 0.12)',
}

type Rgb = { r: number; g: number; b: number }

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function rgbToHex({ r, g, b }: Rgb): string {
  const to = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0')
  return `#${to(r)}${to(g)}${to(b)}`
}

function rgbToHsl({ r, g, b }: Rgb): { h: number; s: number; l: number } {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2

  if (max === min) return { h: 0, s: 0, l }

  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)

  if (max === rn) {
    return { h: (((gn - bn) / d + (gn < bn ? 6 : 0)) / 6) * 360, s, l }
  }
  if (max === gn) {
    return { h: (((bn - rn) / d + 2) / 6) * 360, s, l }
  }
  return { h: (((rn - gn) / d + 4) / 6) * 360, s, l }
}

function hslToRgb(h: number, s: number, l: number): Rgb {
  const hue = ((h % 360) + 360) % 360
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1))
  const m = l - c / 2
  const segment = Math.floor(hue / 60)
  const values = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ][segment] ?? [c, x, 0]

  return {
    r: (values[0]! + m) * 255,
    g: (values[1]! + m) * 255,
    b: (values[2]! + m) * 255,
  }
}


function scorePixel(rgb: Rgb): number {
  const { s, l } = rgbToHsl(rgb)
  if (l < 0.12 || l > 0.9 || s < 0.18) return 0
  const midTone = 1 - Math.abs(l - 0.48) * 1.6
  return s * midTone
}

function buildPalette(rgb: Rgb): ImagePalette {
  const { h, s, l } = rgbToHsl(rgb)
  const accent = hslToRgb(h, clamp(s, 0.45, 0.95), clamp(l, 0.42, 0.58))
  const accentLight = hslToRgb(h, clamp(s * 0.85, 0.35, 0.9), clamp(l + 0.14, 0.5, 0.72))
  const accentRgb: [number, number, number] = [
    Math.round(accent.r),
    Math.round(accent.g),
    Math.round(accent.b),
  ]

  return {
    accent: rgbToHex(accent),
    accentRgb,
    accentLight: rgbToHex(accentLight),
    accentMuted: `rgba(${accentRgb[0]}, ${accentRgb[1]}, ${accentRgb[2]}, 0.24)`,
    accentSoft: `rgba(${accentRgb[0]}, ${accentRgb[1]}, ${accentRgb[2]}, 0.14)`,
  }
}

function extractPaletteFromImageData(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): ImagePalette {
  let totalR = 0
  let totalG = 0
  let totalB = 0
  let totalWeight = 0

  const step = 2
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4
      const rgb = { r: data[i]!, g: data[i + 1]!, b: data[i + 2]! }
      const weight = scorePixel(rgb)
      if (weight <= 0) continue
      totalR += rgb.r * weight
      totalG += rgb.g * weight
      totalB += rgb.b * weight
      totalWeight += weight
    }
  }

  if (totalWeight <= 0) return DEFAULT_IMAGE_PALETTE

  const dominant = {
    r: totalR / totalWeight,
    g: totalG / totalWeight,
    b: totalB / totalWeight,
  }

  return buildPalette(dominant)
}

export function extractPaletteFromImage(img: HTMLImageElement): ImagePalette {
  const size = 48
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx || img.naturalWidth <= 0 || img.naturalHeight <= 0) {
    return DEFAULT_IMAGE_PALETTE
  }

  ctx.drawImage(img, 0, 0, size, size)
  const data = ctx.getImageData(0, 0, size, size).data
  return extractPaletteFromImageData(data, size, size)
}

export function loadImagePalette(imageUrl: string): Promise<ImagePalette> {
  return new Promise((resolve) => {
    const img = new Image()
    img.decoding = 'async'
    img.crossOrigin = 'anonymous'

    const finish = (palette: ImagePalette) => {
      img.onload = null
      img.onerror = null
      resolve(palette)
    }

    img.onload = () => {
      try {
        finish(extractPaletteFromImage(img))
      } catch {
        finish(DEFAULT_IMAGE_PALETTE)
      }
    }

    img.onerror = () => finish(DEFAULT_IMAGE_PALETTE)
    img.src = imageUrl
  })
}

export function paletteGlow(
  rgb: [number, number, number],
  alpha = 0.45,
): string {
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`
}

export function paletteCssVars(palette: ImagePalette): Record<string, string> {
  const [r, g, b] = palette.accentRgb
  return {
    '--np-accent': palette.accent,
    '--np-accent-light': palette.accentLight,
    '--np-accent-muted': palette.accentMuted,
    '--np-accent-soft': palette.accentSoft,
    '--np-accent-rgb': `${r} ${g} ${b}`,
    '--np-accent-glow': paletteGlow(palette.accentRgb, 0.42),
    '--np-accent-glow-strong': paletteGlow(palette.accentRgb, 0.62),
    '--np-accent-border': `rgba(${r}, ${g}, ${b}, 0.42)`,
    '--np-accent-ring': `rgba(${r}, ${g}, ${b}, 0.18)`,
  }
}
