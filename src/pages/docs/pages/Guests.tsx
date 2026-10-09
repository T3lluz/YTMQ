import { QueueOrderDiagram } from '../diagrams'
import { A, B, Callout, Figure, H2, Lead, P, Table, UL } from '../ui'

export default function Guests() {
  return (
    <>
      <Lead>
        Guests need a phone with a browser. No app, no account. The music plays from the host&apos;s
        speakers; your phone is the remote.
      </Lead>

      <H2>Get in</H2>
      <UL>
        <li>
          <B>Scan the QR</B> on the host&apos;s screen. It opens the lobby directly.
        </li>
        <li>
          <B>Or type the code</B> at <A to="/">t3lluz.com/ytmq</A>. Codes are six letters and digits,
          and capitals do not matter.
        </li>
      </UL>
      <P>
        You then pick a name. It shows next to every song you add, so people know who picked what.
        Your phone remembers it for next time.
      </P>

      <H2>The four tabs</H2>
      <Table
        head={['Tab', 'What is there']}
        rows={[
          [<B>Search</B>, 'All of YouTube Music. Filter by songs or artists; tap an artist for their songs.'],
          [<B>Queue</B>, 'What is coming up, who added it, and a Played list to queue a song again in one tap.'],
          [<B>Lyrics</B>, 'Synced lyrics for whatever is playing, highlighted line by line.'],
          [<B>Room</B>, 'Your name, who else is here, and the QR and link to bring more people in.'],
        ]}
      />
      <P>
        The current song sits above the tabs on a phone, or in a sidebar on a laptop, with controls
        if the host allows them.
      </P>

      <H2>Play next or Add to queue</H2>
      <P>
        Every song has two buttons. <B>Play next</B> puts it at the top, so it plays right after the
        current song. <B>Add to queue</B> puts it at the end. The server picks the spot, so two people
        pressing Play next at the same moment never land on top of each other: the later one goes
        above.
      </P>
      <Figure caption="Positions are numbers on the server. Play next takes the lowest minus one; Add to queue the highest plus one.">
        <QueueOrderDiagram />
      </Figure>
      <P>When a song starts playing it leaves the queue and shows up under Played.</P>

      <H2>What the host can switch off</H2>
      <P>
        The host decides whether guests can add, remove or control playback. If something you
        expect is missing, that is probably why, and the app says so where the button would be.
      </P>
      <Callout tone="note" title="Removed from a lobby?">
        <p>
          The host can remove people by name. You will see a screen saying so. Ask them, not the
          app.
        </p>
      </Callout>
    </>
  )
}
