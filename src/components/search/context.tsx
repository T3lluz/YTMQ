import { createContext, useContext } from 'react'
import type { QueueAdder } from '../../hooks/useQueueAdder'
import type { ArtistRef, CatalogAlbum, CatalogArtist, CatalogPlaylist, AlbumRef } from '../../lib/catalog'
import type { SearchView } from '../../lib/searchStore'

export type SearchNav = {
  nickname: string
  adder: QueueAdder
  open: (view: SearchView) => void
  back: () => void
}

export const SearchNavContext = createContext<SearchNav | null>(null)

export function useSearchNav(): SearchNav {
  const nav = useContext(SearchNavContext)
  if (!nav) throw new Error('useSearchNav outside SearchNavContext')
  return nav
}

export function artistView(a: ArtistRef | CatalogArtist): SearchView | null {
  if (!a.id) return null
  return 'thumbnail' in a ? { kind: 'artist', id: a.id, name: a.name, thumbnail: a.thumbnail } : { kind: 'artist', id: a.id, name: a.name }
}

export function albumView(a: AlbumRef | CatalogAlbum): SearchView | null {
  if (!a.id) return null
  return 'thumbnail' in a
    ? { kind: 'album', id: a.id, title: a.title, thumbnail: a.thumbnail }
    : { kind: 'album', id: a.id, title: a.name }
}

export function playlistView(p: CatalogPlaylist): SearchView {
  return { kind: 'playlist', id: p.id, title: p.title, thumbnail: p.thumbnail }
}
