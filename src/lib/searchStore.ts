// What the Search tab shows, kept outside React so it survives switching tabs
// (Spotify keeps your search when you look at the queue and come back).

import { useSyncExternalStore } from 'react'
import type { CatalogItem, SearchFilter } from './catalog'

export type SearchView =
  | { kind: 'artist'; id: string; name?: string; thumbnail?: string }
  | { kind: 'album'; id: string; title?: string; thumbnail?: string }
  | { kind: 'playlist'; id: string; title?: string; thumbnail?: string }
  | { kind: 'mood'; params: string; title: string; color?: string }

export type SearchState = {
  query: string
  filter: SearchFilter
  /** Pages opened on top of the results, newest last. */
  stack: SearchView[]
}

let state: SearchState = { query: '', filter: 'all', stack: [] }
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

export function setSearchState(patch: Partial<SearchState>) {
  state = { ...state, ...patch }
  emit()
}

export function getSearchState() {
  return state
}

export function useSearchState(): SearchState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => state,
  )
}

export function resetSearch() {
  state = { query: '', filter: 'all', stack: [] }
  emit()
}

// --- Recent searches -------------------------------------------------------------

export type RecentEntry =
  | { kind: 'query'; q: string }
  | { kind: 'item'; item: CatalogItem }

const RECENT_KEY = 'ytmq_recent_searches'
const RECENT_MAX = 12

function recentKey(entry: RecentEntry): string {
  if (entry.kind === 'query') return `q:${entry.q.toLowerCase()}`
  const item = entry.item
  return item.kind === 'track' ? `track:${item.videoId}` : `${item.kind}:${item.id}`
}

export function loadRecent(): RecentEntry[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as RecentEntry[]
    return Array.isArray(raw) ? raw.slice(0, RECENT_MAX) : []
  } catch {
    return []
  }
}

let recent = loadRecent()
const recentListeners = new Set<() => void>()

function saveRecent(next: RecentEntry[]) {
  recent = next.slice(0, RECENT_MAX)
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent))
  } catch {
    /* private mode */
  }
  for (const listener of recentListeners) listener()
}

export function rememberSearch(entry: RecentEntry) {
  const key = recentKey(entry)
  saveRecent([entry, ...recent.filter((e) => recentKey(e) !== key)])
}

export function forgetSearch(entry: RecentEntry) {
  const key = recentKey(entry)
  saveRecent(recent.filter((e) => recentKey(e) !== key))
}

export function clearRecentSearches() {
  saveRecent([])
}

export function useRecentSearches(): RecentEntry[] {
  return useSyncExternalStore(
    (listener) => {
      recentListeners.add(listener)
      return () => recentListeners.delete(listener)
    },
    () => recent,
  )
}
