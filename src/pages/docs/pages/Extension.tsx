import { PillMock, PopupMock } from '../mocks'
import { A, B, Code, H2, H3, Lead, P, Table, UL } from '../ui'

export default function Extension() {
  return (
    <>
      <Lead>
        The extension has two faces. A pill on the YouTube Music page, which is about that tab. And
        a toolbar popup, which is about the whole lobby, Spotify included.
      </Lead>

      <H2>The pill and panel on YouTube Music</H2>
      <div className="mt-5">
        <PillMock />
      </div>
      <P>
        The pill shows the lobby code, songs queued and people listening. Its dot is green when the
        tab is linked, amber while it connects, and grey when there is no lobby. Click it to open the
        panel:
      </P>
      <UL>
        <li>The code, a QR to scan, and a button that copies the lobby link.</li>
        <li>What is playing, with play, pause, next and previous.</li>
        <li>
          <B>Up next from guests</B>: the shared queue with who added each song. Hover a song and press
          the cross to remove it.
        </li>
        <li>
          Songs that did not reach YouTube Music yet, with <B>Retry</B>.
        </li>
        <li>What YouTube Music plays by itself once the shared queue is empty.</li>
      </UL>
      <P>
        Drag the pill anywhere; it snaps to the nearer side. Double-click puts it back above the
        player. <Code>Esc</Code> closes the panel.
      </P>

      <H2>The toolbar popup</H2>
      <div className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-start">
        <PopupMock />
        <div className="min-w-0 flex-1 text-neutral-300">
          <p className="leading-7">
            The popup talks to the server itself, so it works with no YouTube Music tab open and
            follows Spotify too. Controls reach whichever player is active.
          </p>
          <p className="mt-4 leading-7">
            <B>Sources</B> lists YouTube Music and Spotify with how each is doing and a button for the
            next step: open the tab, link it, or set Spotify up in Admin.
          </p>
        </div>
      </div>

      <H2>States</H2>
      <Table
        head={['You see', 'Meaning', 'Do this']}
        rows={[
          [<B>Not linked</B>, 'The extension has no lobby.', 'Create a lobby and press Connect YouTube Music in Admin.'],
          [<B>Connecting</B>, 'The tab is joining the lobby.', 'Wait a second or two. Signed out of YouTube Music? Sign in.'],
          [<B>Live</B>, 'Linked. Guest songs go into this tab.', 'Nothing.'],
          [<B>Ended</B>, 'The lobby was ended or expired.', 'Start a new lobby.'],
          [<B>No access</B>, 'Site access for YouTube Music or t3lluz.com is off.', 'Press Allow access once. It stays on.'],
        ]}
      />

      <H2>Permissions</H2>
      <P>
        YTMQ asks for two sites and nothing else. It cannot read other tabs, your history or your
        YouTube account.
      </P>
      <Table
        head={['Permission', 'Why']}
        rows={[
          [<Code>music.youtube.com</Code>, 'To put guest songs into your queue, read what is playing, and show the pill.'],
          [<Code>t3lluz.com</Code>, 'To talk to your lobby, and to notice which lobby you opened.'],
          [<Code>storage</Code>, 'To remember the linked lobby (for 7 days) and the pill position.'],
          [<Code>scripting</Code>, 'To start the YouTube Music bridge in the page.'],
        ]}
      />

      <H2>Updates</H2>
      <H3>Chrome</H3>
      <P>
        Chrome does not update unpacked extensions. The bridge, which is most of the logic, loads
        from the site each time a tab connects, so most fixes need nothing from you. For the rest
        the site publishes a fingerprint of the extension&apos;s files. When yours differs, the icon
        says <B>NEW</B> and the panel and popup offer <B>Download</B> and <B>Reload</B>.
      </P>
      <H3>Firefox</H3>
      <P>
        Mozilla signs every build and Firefox updates it like any add-on. Mozilla does not allow code
        loaded from a server, so the Firefox build runs the bridge it shipped with, and a bridge fix
        arrives as a normal update.
      </P>
      <P>
        Install steps are on <A to="/docs/install">Install the extension</A>.
      </P>
    </>
  )
}
