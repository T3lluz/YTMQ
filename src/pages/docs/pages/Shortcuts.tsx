import { LyricsChain } from '../diagrams'
import { B, Callout, Figure, H2, Kbd, Lead, P, Table, UL } from '../ui'

export default function Shortcuts() {
  return (
    <>
      <Lead>
        On a computer the lobby page doubles as a remote. These keys work anywhere in the lobby,
        except while you are typing in a box.
      </Lead>

      <H2>Keyboard</H2>
      <Table
        head={['Key', 'Does']}
        rows={[
          [<Kbd>Space</Kbd>, 'Play or pause'],
          [<Kbd>→</Kbd>, 'Next song'],
          [<Kbd>←</Kbd>, 'Back to the start of the song; within the first 3 seconds, the previous song'],
          [<Kbd>F</Kbd>, 'Lyrics fullscreen on or off (Lyrics tab, desktop)'],
          [<Kbd>Esc</Kbd>, 'Close the QR card, or the YTMQ panel on YouTube Music'],
        ]}
      />
      <P>
        Playback keys need control rights. The host always has them; guests have them unless the host
        turned <B>Guests can control playback</B> off.
      </P>

      <H2>The lyrics screen</H2>
      <UL>
        <li>The current line is large and bright, the rest fade with distance. It follows the song by itself.</li>
        <li>Tap the progress bar to jump in the song (with control rights).</li>
        <li>
          The <B>−</B> and <B>+</B> buttons size the text, and the percentage between them resets it. Handy on a TV.
        </li>
        <li>On a desktop, Lyrics fills the screen, with a volume slider and an Up next banner before each song ends.</li>
        <li>No lyrics for a song, or an instrumental? The screen centres the album art, title and progress instead.</li>
      </UL>

      <H2>Where lyrics come from</H2>
      <P>
        The server asks four sources at once and keeps the best answer. Synced lyrics always beat
        plain text.
      </P>
      <Figure>
        <LyricsChain />
      </Figure>
      <Callout tone="note" title="Wrong lyrics?">
        <p>
          Matching uses the title, artist, album and length YouTube Music reports. Live versions and
          remixes sometimes match the studio version. There is no manual override yet.
        </p>
      </Callout>
    </>
  )
}
