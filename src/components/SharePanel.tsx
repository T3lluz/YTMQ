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
          className="ytmq-anim-pop max-w-full rounded-2xl bg-white p-2.5"
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
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500">Lobby code</p>
        <p className="font-mono text-3xl font-medium tracking-[0.25em] text-white">{code}</p>
      </div>

      <p className="w-full min-w-0 break-all rounded-xl bg-white/[0.04] px-3 py-2.5 text-center font-mono text-xs text-neutral-400 select-text">
        {link}
      </p>

      <div className="grid w-full grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => void copy('code')}
          className="ytmq-press inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full bg-white/[0.08] px-3 text-sm font-semibold text-white hover:bg-white/[0.14]"
        >
          {copied === 'code' && <CopiedCheck />}
          {copied === 'code' ? 'Copied' : 'Copy code'}
        </button>
        <button
          type="button"
          onClick={() => void copy('link')}
          className="ytmq-press inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full bg-white px-3 text-sm font-semibold text-neutral-950 hover:bg-neutral-200"
        >
          {copied === 'link' && <CopiedCheck />}
          {copied === 'link' ? 'Copied' : 'Copy link'}
        </button>
      </div>
    </div>
  )
}
