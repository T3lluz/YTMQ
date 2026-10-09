import { A, B, Callout, CodeBlock, H2, Lead, P, Table } from '../ui'

export default function Spotify() {
  return (
    <>
      <Lead>
        If the music is coming from Spotify, YTMQ can follow it. Guests then see what is playing and
        get synced lyrics, from any Spotify app on any device.
      </Lead>

      <H2>Connect it</H2>
      <P>
        In the lobby, open <B>Admin</B> and press <B>Connect Spotify</B>. Spotify asks you to approve
        YTMQ, then sends you back to the lobby. Play something in any Spotify app; the lobby picks it
        up within a few seconds.
      </P>
      <Callout tone="warn" title="Keep the lobby tab open">
        <p>
          The host&apos;s lobby tab is what reads Spotify and passes it on. Close it and guests stop
          seeing updates until you open it again.
        </p>
      </Callout>

      <H2>What works</H2>
      <Table
        head={['', 'Spotify Free', 'Spotify Premium']}
        rows={[
          ['Now playing and progress', 'Yes', 'Yes'],
          ['Synced lyrics', 'Yes', 'Yes'],
          ['Play, pause, skip, seek from YTMQ', 'No', 'Yes'],
          ['Guest picks play on Spotify', 'No', 'No'],
        ]}
      />
      <P>
        The shared queue stays a YouTube Music queue. Spotify is for following along, which suits a
        night where some songs come from each.
      </P>

      <H2>Both at once</H2>
      <P>
        You can link YouTube Music and Spotify together. Now playing shows Spotify while it is
        actively playing and falls back to YouTube Music otherwise, so whichever you press play on
        wins.
      </P>

      <H2>Privacy</H2>
      <P>
        YTMQ uses Spotify&apos;s own login (OAuth with PKCE). The token stays in your browser; the server
        never sees it. It only reads what is playing and, with Premium, sends play, pause, skip and
        seek. Disconnect in Admin forgets the token.
      </P>

      <H2>Running your own copy</H2>
      <P>
        The app ships with a Spotify client ID. If you host YTMQ yourself with your own Spotify app,
        add these redirect URIs, trailing slash included. Spotify rejects <B>localhost</B>, so open the
        dev server at 127.0.0.1.
      </P>
      <CodeBlock title="Redirect URIs">{`
http://127.0.0.1:5173/ytmq/
https://t3lluz.com/ytmq/
`}</CodeBlock>
      <P>
        Then set <B>VITE_SPOTIFY_CLIENT_ID</B> in <B>.env.local</B>. The code is on <A to="https://github.com/T3lluz/YTMQ">GitHub</A>.
      </P>
    </>
  )
}
