import { A, B, H2, Lead, P, Table, UL } from '../ui'

export default function Privacy() {
  return (
    <>
      <Lead>
        YTMQ keeps as little as it can, for as short as it can. There are no accounts, no analytics and
        no ads.
      </Lead>

      <H2>On the server</H2>
      <Table
        head={['What', 'Kept for', 'Notes']}
        rows={[
          ['Lobby: code, settings, host token', '24 hours', 'The password, if set, is a PBKDF2 hash.'],
          ['Queue: song id, title, artist, art link, who added it', 'Until played or the lobby ends', 'Played songs are deleted.'],
          ['People: the name you typed, a random device id, last seen', 'Until the lobby ends', 'No IP addresses or emails.'],
          ['Search and lyrics lookups', 'Not stored', 'Lyrics lookups are logged (title, artist, which source answered) to fix bad matches.'],
        ]}
      />
      <P>
        Lobbies and everything in them are deleted 24 hours after they start, or as soon as the host
        ends them.
      </P>

      <H2>In your browser</H2>
      <UL>
        <li>The name you used last, so the next join form is filled in.</li>
        <li>Lobbies you were in during the last day, for Jump back in on the homepage.</li>
        <li>If you host: the lobby&apos;s host token, for 24 hours.</li>
        <li>If you connect Spotify: Spotify&apos;s token. It never leaves your browser.</li>
        <li>Played songs per lobby, for the Played list. Clear removes them.</li>
      </UL>

      <H2>The extension</H2>
      <P>
        It runs on <B>music.youtube.com</B> and <B>t3lluz.com</B> only. It sends your lobby what YouTube
        Music is playing and the state of the queue, nothing else. It does not read other sites, your
        history or your Google account.
      </P>

      <H2>Third parties</H2>
      <UL>
        <li>The site loads its fonts from Google Fonts.</li>
        <li>Album art comes from YouTube&apos;s image servers (i.ytimg.com), or Spotify&apos;s when Spotify plays.</li>
        <li>The server asks YouTube Music and the lyrics sites on your behalf. They see the server, not you.</li>
      </UL>
      <P>
        Questions or a removal request: open an issue on <A to="https://github.com/T3lluz/YTMQ/issues">GitHub</A>.
      </P>
    </>
  )
}
