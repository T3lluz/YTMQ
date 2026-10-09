import { ArchitectureDiagram } from '../diagrams'
import { A, B, Card, CardGrid, Figure, H2, Lead, P, UL } from '../ui'

export default function Overview() {
  return (
    <>
      <Lead>
        YTMQ is a shared queue for YouTube Music. One person plays the music on their computer.
        Everyone else opens a link on their phone, searches, and adds songs. The songs play in
        the host&apos;s YouTube Music, in order, and everyone sees what is on and what is next.
      </Lead>

      <CardGrid>
        <Card to="/docs/install" title="Hosting tonight?">
          Install the extension once, then create a lobby. Takes a couple of minutes.
        </Card>
        <Card to="/docs/guests" title="Got a code?">
          Open t3lluz.com/ytmq on your phone, type the code, pick a name. That is it.
        </Card>
      </CardGrid>

      <H2>How the pieces fit</H2>
      <P>
        There are three parts. Guests use the website. The host&apos;s browser runs YouTube Music
        with the YTMQ extension. A small server on t3lluz.com sits in the middle and keeps
        everyone in sync over a WebSocket.
      </P>
      <Figure caption="Red arrows are the path a song takes. Grey ones carry state back out to every screen.">
        <ArchitectureDiagram />
      </Figure>

      <H2>What you get</H2>
      <UL>
        <li>
          <B>One queue for the room.</B> Play next puts a song at the top, Add to queue puts it at
          the end. Everyone sees who added what.
        </li>
        <li>
          <B>Now playing on every phone</B>, with album colors, progress and controls (the host can
          turn controls off for guests).
        </li>
        <li>
          <B>Synced lyrics</B> from four sources, with a fullscreen mode for a TV or projector.
        </li>
        <li>
          <B>Host tools</B>: lock the lobby, set a password, decide what guests may do, remove
          people.
        </li>
        <li>
          <B>Spotify too</B>, if that is what is playing. YTMQ follows it for now playing and
          lyrics.
        </li>
      </UL>

      <H2>What it does not do</H2>
      <P>
        Guests do not hear the music on their phones; it plays from the host&apos;s speakers. There
        are no accounts, so nothing carries over between lobbies, and a lobby ends after 24 hours.
        YouTube Music has no public queue API, so the extension drives the YouTube Music page the way
        you would by hand. It works well, and it means the host needs a desktop browser, not the
        phone app.
      </P>
      <P>
        Building something on top? The <A to="/docs/api">API reference</A> covers every endpoint and
        the realtime protocol.
      </P>
    </>
  )
}
