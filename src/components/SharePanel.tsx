import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { shareUrl } from '../lib/room'

type SharePanelProps = {
  roomId: string
  code: string
  onCopied?: (message: string) => void
}

function CopiedCheck() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      className="ytmq-check h-3.5 w-3.5"
      aria-hidden
    >
      <path
        fillRule="evenodd"
        d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0l-3.5-3.5a1 1 0 1 1 1.4-1.4l2.8 2.79 6.8-6.79a1 1 0 0 1 1.4 0Z"
        clipRule="evenodd"
      />
    </svg>
  )
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
          className="ytmq-anim-pop rounded-xl bg-white p-2"
          width={220}
          height={220}
        />
      ) : (
        <div
          className="ytmq-skeleton rounded-xl"
          style={{ width: 220, height: 220 }}
          aria-label="Generating QR code"
        />
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
          className="ytmq-press inline-flex min-h-12 items-center justify-center gap-1.5 rounded-xl border border-zinc-700 px-3 text-sm font-medium hover:border-zinc-600 hover:bg-zinc-900"
        >
          {copied === 'code' && <CopiedCheck />}
          {copied === 'code' ? 'Copied!' : 'Copy code'}
        </button>
        <button
          type="button"
          onClick={() => void copyLink()}
          className="ytmq-press inline-flex min-h-12 items-center justify-center gap-1.5 rounded-xl bg-violet-600 px-3 text-sm font-medium text-white hover:bg-violet-500"
        >
          {copied === 'link' && <CopiedCheck />}
          {copied === 'link' ? 'Copied!' : 'Copy link'}
        </button>
      </div>
    </div>
  )
}
