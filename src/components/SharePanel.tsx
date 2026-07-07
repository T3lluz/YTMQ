import { CopiedCheck } from './CopiedCheck'
import { useLobbyShare } from '../hooks/useLobbyShare'

type SharePanelProps = {
  roomId: string
  code: string
  onCopied?: (message: string) => void
}

export function SharePanel({ roomId, code, onCopied }: SharePanelProps) {
  const { link, qrDataUrl, copied, copy } = useLobbyShare(roomId, code, {
    qrWidth: 220,
    onCopied,
  })

  return (
    <div className="flex flex-col items-center gap-4">
      {qrDataUrl ? (
        <img
          src={qrDataUrl}
          alt={`QR code for room ${code}`}
          className="ytmq-anim-pop max-w-full rounded-xl bg-white p-2"
          width={220}
          height={220}
        />
      ) : (
        <div
          className="ytmq-skeleton max-w-full rounded-xl"
          style={{ width: 220, height: 220 }}
          aria-label="Generating QR code"
        />
      )}

      <div className="w-full min-w-0 space-y-2 text-center">
        <p className="text-sm text-zinc-500">Room code</p>
        <p className="font-mono text-2xl tracking-widest sm:text-3xl">{code}</p>
      </div>

      <p className="w-full min-w-0 break-all rounded-lg bg-zinc-900 p-3 text-center text-sm text-zinc-300">
        {link}
      </p>

      <div className="grid w-full grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => void copy('code')}
          className="ytmq-press inline-flex min-h-12 items-center justify-center gap-1.5 rounded-xl border border-zinc-700 px-3 text-sm font-medium hover:border-zinc-600 hover:bg-zinc-900"
        >
          {copied === 'code' && <CopiedCheck />}
          {copied === 'code' ? 'Copied!' : 'Copy code'}
        </button>
        <button
          type="button"
          onClick={() => void copy('link')}
          className="ytmq-press inline-flex min-h-12 items-center justify-center gap-1.5 rounded-xl bg-violet-600 px-3 text-sm font-medium text-white hover:bg-violet-500"
        >
          {copied === 'link' && <CopiedCheck />}
          {copied === 'link' ? 'Copied!' : 'Copy link'}
        </button>
      </div>
    </div>
  )
}
