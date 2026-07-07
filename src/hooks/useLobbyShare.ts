import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { shareUrl } from '../lib/room'

type CopyKind = 'link' | 'code'

export function useLobbyShare(
  roomId: string,
  code: string,
  options?: { qrWidth?: number; onCopied?: (message: string) => void },
) {
  const link = shareUrl(roomId)
  const qrWidth = options?.qrWidth ?? 220
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState<CopyKind | null>(null)

  useEffect(() => {
    let cancelled = false
    void QRCode.toDataURL(link, { margin: 2, width: qrWidth })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url)
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl(null)
      })
    return () => {
      cancelled = true
    }
  }, [link, qrWidth])

  async function copy(kind: CopyKind) {
    await navigator.clipboard.writeText(kind === 'link' ? link : code)
    setCopied(kind)
    options?.onCopied?.(kind === 'link' ? 'Link copied' : 'Code copied')
    window.setTimeout(() => setCopied(null), 2000)
  }

  return { link, qrDataUrl, copied, copy }
}
