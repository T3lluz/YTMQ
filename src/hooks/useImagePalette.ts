import { useEffect, useState } from 'react'
import {
  DEFAULT_IMAGE_PALETTE,
  loadImagePalette,
  type ImagePalette,
} from '../lib/imagePalette'

type PaletteState = {
  palette: ImagePalette
  ready: boolean
  url?: string
}

export function useImagePalette(imageUrl: string | undefined) {
  const [state, setState] = useState<PaletteState>({
    palette: DEFAULT_IMAGE_PALETTE,
    ready: false,
  })

  useEffect(() => {
    if (!imageUrl) return

    let cancelled = false

    void loadImagePalette(imageUrl).then((next) => {
      if (cancelled) return
      setState({ palette: next, ready: true, url: imageUrl })
    })

    return () => {
      cancelled = true
    }
  }, [imageUrl])

  if (!imageUrl || state.url !== imageUrl) {
    return { palette: DEFAULT_IMAGE_PALETTE, ready: false }
  }

  return { palette: state.palette, ready: state.ready }
}
