import { useLobbyShare } from '../hooks/useLobbyShare'
import { Button } from './ui/Button'
import { CheckIcon, CopyIcon, LinkIcon } from './ui/icons'

type SharePanelProps = {
  roomId: string
  code: string
  onCopied?: (message: string) => void
  /** Side by side (QR left) instead of stacked. */
  layout?: 'stack' | 'row'
}

/** The QR, the code and the link, with copy buttons. */
export function SharePanel({ roomId, code, onCopied, layout = 'stack' }: SharePanelProps) {
  const { link, qrDataUrl, copied, copy } = useLobbyShare(roomId, code, { qrWidth: 360, onCopied })
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  const qr = qrDataUrl ? (
    <img
      src={qrDataUrl}
      alt={`QR code for lobby ${code}`}
      className="ytmq-anim-pop aspect-square w-full max-w-[13rem] rounded-2xl bg-white p-2.5"
    />
  ) : (
    <div className="ytmq-skeleton aspect-square w-full max-w-[13rem] rounded-2xl" aria-label="Making the QR code" />
  )

  return (
    <div className={`flex gap-5 ${layout === 'row' ? 'flex-col items-center sm:flex-row sm:items-center' : 'flex-col items-center'}`}>
      <div className={`flex w-full justify-center ${layout === 'row' ? 'sm:w-auto sm:shrink-0' : ''}`}>{qr}</div>
      <div className={`flex w-full min-w-0 flex-col gap-4 ${layout === 'row' ? 'sm:items-start' : 'items-center'}`}>
        <div className={layout === 'row' ? 'text-center sm:text-left' : 'text-center'}>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-neutral-500">Lobby code</p>
          <p className="mt-1 font-mono text-[2rem] font-semibold leading-none tracking-[0.22em] text-white">{code}</p>
          <p className="mt-2 max-w-full truncate font-mono text-xs text-neutral-500 select-text">{link.replace(/^https?:\/\//, '')}</p>
        </div>
        <div className={`flex flex-wrap gap-2 ${layout === 'row' ? 'justify-center sm:justify-start' : 'justify-center'}`}>
          <Button
            variant="primary"
            icon={copied === 'link' ? <CheckIcon className="h-4 w-4" /> : <LinkIcon className="h-4 w-4" />}
            onClick={() => void copy('link')}
          >
            {copied === 'link' ? 'Copied' : 'Copy link'}
          </Button>
          <Button
            variant="tonal"
            icon={copied === 'code' ? <CheckIcon className="h-4 w-4" /> : <CopyIcon className="h-4 w-4" />}
            onClick={() => void copy('code')}
          >
            {copied === 'code' ? 'Copied' : 'Copy code'}
          </Button>
          {canShare && (
            <Button
              variant="tonal"
              onClick={() => void navigator.share({ title: 'YTMQ lobby', text: `Join my YTMQ lobby: ${code}`, url: link }).catch(() => {})}
            >
              Share
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
