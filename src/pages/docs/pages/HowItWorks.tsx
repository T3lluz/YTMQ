import { AddSongSequence, ArchitectureDiagram, LyricsChain, TimingsChart } from '../diagrams'
import { A, B, Code, Figure, H2, Lead, P, Table, UL } from '../ui'

export default function HowItWorks() {
  return (
    <>
      <Lead>
        YTMQ is three small programs: a React app, one Deno server with SQLite, and a browser
        extension that drives YouTube Music. This page follows a song through all three.
      </Lead>

      <H2>The parts</H2>
      <Figure>
        <ArchitectureDiagram />
      </Figure>
      <Table
        head={['Part', 'Where', 'Job']}
        rows={[
          [<B>App</B>, 'React, Vite, Tailwind at t3lluz.com/ytmq', 'What guests and the host use. Search, queue, lyrics, admin.'],
          [<B>Server</B>, 'One Deno process, SQLite file', 'Rooms, queue and people; the realtime WebSocket; search and lyrics lookups.'],
          [<B>Bridge</B>, 'Script inside the YouTube Music page', 'Adds queued songs to YouTube Music, reads what is playing, runs controls.'],
          [<B>Extension</B>, 'Chrome and Firefox, Manifest V3', 'Starts the bridge in every YouTube Music tab and shows the pill and popup.'],
        ]}
      />

      <H2>The path of a song</H2>
      <P>
        A guest taps <B>Play next</B>. Here is everything that happens, top to bottom, usually in well
        under a second.
      </P>
      <Figure caption="Red: the song on its way in. Grey: state flowing back out.">
        <AddSongSequence />
      </Figure>
      <UL>
        <li>
          The server picks the position inside one SQLite statement, so two guests racing on Play next
          cannot get the same slot. See <A to="/docs/guests#play-next-or-add-to-queue">queue order</A>.
        </li>
        <li>
          Every saved row becomes a <Code>change</Code> message for everyone who has that lobby open,
          including the bridge. Nobody polls.
        </li>
        <li>
          YouTube Music has no queue API, so the bridge uses the page&apos;s own queue the way its menus
          do. That is why YouTube Music has to stay open in a desktop browser.
        </li>
        <li>
          The bridge publishes now playing every 2 seconds. When the song a guest queued starts, the
          bridge deletes its row, which moves it to Played on every phone.
        </li>
      </UL>

      <H2>Search</H2>
      <P>
        Search runs on the server against YouTube Music&apos;s own web API, the same one the website
        uses. No API key, no Google account. Results are songs and artists; tapping an artist loads
        their songs.
      </P>

      <H2>Lyrics</H2>
      <P>
        The app sends the title, artist, album and length; the server asks Musixmatch, LRCLIB, NetEase
        and KuGou at once and picks in this order:
      </P>
      <Figure>
        <LyricsChain />
      </Figure>

      <H2>Timers</H2>
      <P>
        A handful of timers decide how fresh things are and how long they last. Hover a bar for what
        it means.
      </P>
      <Figure caption="Logarithmic scale, 10 seconds to one week.">
        <TimingsChart />
      </Figure>

      <H2>Deploys</H2>
      <P>
        Pushing to <Code>main</Code> on GitHub is the deploy. A timer on t3lluz checks every minute,
        builds the app, the bridge and both extension packages, and swaps the new build in at once. A
        failed build leaves the previous one up. When the extension changed, the deploy also gets the
        Firefox build signed by Mozilla and publishes it for automatic updates.
      </P>
      <P>
        The source is on <A to="https://github.com/T3lluz/YTMQ">GitHub</A>. The <A to="/docs/api">API</A>{' '}
        page documents the server.
      </P>
    </>
  )
}
