export type DocPage = {
  slug: string
  title: string
  /** One line for cards and the page subtitle. */
  blurb: string
}

export type DocGroup = { title: string; pages: DocPage[] }

export const DOC_GROUPS: DocGroup[] = [
  {
    title: 'Start here',
    pages: [
      { slug: '', title: 'Overview', blurb: 'What YTMQ is and how the pieces fit.' },
      { slug: 'install', title: 'Install the extension', blurb: 'One time, on the computer that plays the music.' },
      { slug: 'hosting', title: 'Host a lobby', blurb: 'Create a lobby, link YouTube Music, run the night.' },
      { slug: 'guests', title: 'Join as a guest', blurb: 'Scan, pick a name, add songs. Nothing to install.' },
    ],
  },
  {
    title: 'Using YTMQ',
    pages: [
      { slug: 'extension', title: 'The extension', blurb: 'The pill on YouTube Music and the toolbar popup.' },
      { slug: 'spotify', title: 'Spotify', blurb: 'Follow what plays on Spotify, on any device.' },
      { slug: 'shortcuts', title: 'Shortcuts and lyrics', blurb: 'Keyboard controls and the lyrics screen.' },
    ],
  },
  {
    title: 'Reference',
    pages: [
      { slug: 'how-it-works', title: 'How it works', blurb: 'From a tap on a phone to a song in YouTube Music.' },
      { slug: 'api', title: 'API', blurb: 'RPCs, REST endpoints and the realtime socket.' },
      { slug: 'privacy', title: 'Data and privacy', blurb: 'What is stored, where, and for how long.' },
    ],
  },
  {
    title: 'Help',
    pages: [
      { slug: 'troubleshooting', title: 'Troubleshooting', blurb: 'When songs do not show up, and other fixes.' },
      { slug: 'changelog', title: 'Changelog', blurb: 'What changed, newest first.' },
    ],
  },
]

export const DOC_PAGES: DocPage[] = DOC_GROUPS.flatMap((g) => g.pages)

export function docPath(slug: string) {
  return slug ? `/docs/${slug}` : '/docs'
}
