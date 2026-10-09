import { YtmWindowMock } from '../mocks'
import { A, B, Callout, Code, Figure, H2, Lead, P, Step, Steps, Table, UL } from '../ui'

export default function Hosting() {
  return (
    <>
      <Lead>
        The host is whoever plays the music. You need a desktop browser with the YTMQ extension
        and YouTube Music open. Everything else happens in the lobby page.
      </Lead>

      <H2>Start a lobby</H2>
      <Steps>
        <Step title="Create it">
          <p>
            Open <A to="/">t3lluz.com/ytmq</A> and press <B>Host a lobby</B>. You land in the lobby
            as its host. The six-character code and the QR are in the dock at the bottom of the
            screen.
          </p>
        </Step>
        <Step title="Link YouTube Music">
          <p>
            Open the <B>Admin</B> tab and press <B>Connect YouTube Music</B>. With the extension
            installed it links the YouTube Music tab you have open, or opens one. Sign in there if it
            asks. No extension yet? The card sends you to the <A to="/docs/install">install guide</A>.
          </p>
        </Step>
        <Step title="Check the pill">
          <p>
            A YTMQ pill appears above the YouTube Music player. Its dot turns green once the tab is
            linked, and it shows the code, how many songs are queued and how many people are in.
          </p>
        </Step>
        <Step title="Let people in">
          <p>
            Put the QR on a screen (the pill opens into a panel with a big one) or read out the code.
            Guests go to t3lluz.com/ytmq, type it, pick a name, and start adding.
          </p>
        </Step>
      </Steps>
      <Figure caption="The pill sits above the player bar. Drag it anywhere; double-click puts it back.">
        <YtmWindowMock />
      </Figure>

      <H2>Settings in Admin</H2>
      <P>Every switch applies at once, for everyone, and you see a confirmation at the bottom of the screen.</P>
      <Table
        head={['Setting', 'What it does', 'Default']}
        rows={[
          [<B>Lock the lobby</B>, 'Nobody new can join. People already in stay. Useful once everyone has arrived.', 'Off'],
          [<B>Guests can add songs</B>, 'Play next and Add to queue for guests. You can always add, even with this off.', 'On'],
          [<B>Guests can remove songs</B>, 'Lets anyone take a song out of the queue.', 'On'],
          [<B>Guests can control playback</B>, 'Play, pause, skip and seek from phones, and the keyboard shortcuts.', 'On'],
          [<B>Password</B>, 'Guests need it to join, by code or by link. Stored hashed (PBKDF2), never in plain text.', 'None'],
        ]}
      />

      <H2>People</H2>
      <P>
        The People list shows everyone who joined, with a green dot for anyone seen in the last 45
        seconds. <B>Kick</B> removes a person by name, so every device using that name is out at once.
        They see a screen saying the host removed them.
      </P>

      <H2>Ending the night</H2>
      <P>
        <B>End the lobby for everyone</B> at the bottom of Admin deletes the lobby, its queue and its
        guest list, and unlinks YouTube Music. If you forget, the lobby ends by itself 24 hours after
        you created it.
      </P>

      <H2>If you close the tab</H2>
      <P>
        Your browser remembers that you host this lobby for 24 hours. Open t3lluz.com/ytmq again and it
        is under <B>Jump back in</B>, with Admin still there. YouTube Music keeps playing and the
        extension keeps the tab linked even while the lobby page is closed.
      </P>
      <Callout tone="tip" title="Hosting from a second computer">
        <p>
          Host status lives in the browser that created the lobby. To run the lobby from somewhere
          else, create it there. Guests can join from anywhere.
        </p>
      </Callout>

      <H2>Good to know</H2>
      <UL>
        <li>
          YouTube Music needs to stay open in a desktop browser. The phone app cannot be driven from
          outside.
        </li>
        <li>
          When the shared queue runs dry, YouTube Music carries on with its own autoplay. The panel
          shows what is coming.
        </li>
        <li>
          If a song does not make it into YouTube Music (a slow tab, a sign-in prompt), the panel
          lists it with a <B>Retry</B> button.
        </li>
        <li>
          Connecting Spotify as well is fine. See <A to="/docs/spotify">Spotify</A> for how the two
          share now playing.
        </li>
        <li>
          Opening a new lobby re-points the extension at it. Old tabs never keep feeding a lobby that
          ended. To unlink by hand, use <B>Disconnect</B> in the panel or popup, or{' '}
          <Code>chrome://extensions</Code> to turn YTMQ off.
        </li>
      </UL>
    </>
  )
}
