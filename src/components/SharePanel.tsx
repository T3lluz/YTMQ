import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { shareUrl } from '../lib/room'

type SharePanelProps = {
  roomId: string
  code: string
  onCopied?: (message: string) => void
}

export function SharePanel({ roomId, code, onCopied }: SharePanelProps) {
  const link = shareUrl(roomId)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState<'link' | 'code' | null>(null)

  useEffect(() => {
    let cancelled = false
    void QRCode.toDataURL(link, { margin: 2, width: 220 })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url)
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl(null)
      })
    return () => {
      cancelled = true
    }
  }, [link])

  async function copyLink() {
    await navigator.clipboard.writeText(link)
    setCopied('link')
    onCopied?.('Link copied')
    window.setTimeout(() => setCopied(null), 2000)
  }

  async function copyCode() {
    await navigator.clipboard.writeText(code)
    setCopied('code')
    onCopied?.('Code copied')
    window.setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div className="flex flex-col items-center gap-4">
      {qrDataUrl ? (
        <img
          src={qrDataUrl}
          alt={`QR code for room ${code}`}
          className="rounded-xl bg-white p-2"
          width={220}
          height={220}
        />
      ) : (
        <p className="py-8 text-sm text-zinc-500">Generating QR…</p>
      )}

      <div className="w-full space-y-2 text-center">
        <p className="text-sm text-zinc-500">Room code</p>
        <p className="font-mono text-3xl tracking-widest">{code}</p>
      </div>

      <p className="w-full break-all rounded-lg bg-zinc-900 p-3 text-center text-sm text-zinc-300">
        {link}
      </p>

      <div className="grid w-full grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => void copyCode()}
          className="min-h-12 rounded-xl border border-zinc-700 px-3 text-sm font-medium active:bg-zinc-900"
        >
          {copied === 'code' ? 'Copied!' : 'Copy code'}
        </button>
        <button
          type="button"
          onClick={() => void copyLink()}
          className="min-h-12 rounded-xl bg-violet-600 px-3 text-sm font-medium text-white active:bg-violet-700"
        >
          {copied === 'link' ? 'Copied!' : 'Copy link'}
        </button>
      </div>
    </div>
  )
}
