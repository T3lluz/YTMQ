/**
 * Spotify Authorization Code + PKCE for the static GitHub Pages app.
 * Tokens live in localStorage on the host's browser only.
 */

const TOKENS_KEY = 'ytmq_spotify_tokens'
const DEVICE_KEY = 'ytmq_spotify_device_id'
const PKCE_KEY = 'ytmq_spotify_pkce'
const RETURN_ROOM_KEY = 'ytmq_spotify_return_room'

/** Public Spotify app for this YTMQ install. Safe to ship in the frontend. */
export const DEFAULT_SPOTIFY_CLIENT_ID = '431fa658f06e4078b3b79f20b41083f1'
export const RESTORE_TAB_KEY = 'ytmq_restore_tab'

const SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
].join(' ')

export type SpotifyTokens = {
  accessToken: string
  refreshToken: string
  expiresAt: number
  displayName?: string
}

type PendingPkce = {
  verifier: string
  state: string
  roomId: string
}

const authListeners = new Set<() => void>()

function emitAuth() {
  for (const listener of authListeners) {
    try {
      listener()
    } catch {
      /* ignore */
    }
  }
}

export function subscribeSpotifyAuth(listener: () => void): () => void {
  authListeners.add(listener)
  return () => {
    authListeners.delete(listener)
  }
}

export function spotifyClientId(): string {
  const env = import.meta.env.VITE_SPOTIFY_CLIENT_ID
  if (typeof env === 'string' && env.trim()) return env.trim()
  return DEFAULT_SPOTIFY_CLIENT_ID
}

export function spotifyClientSecret(): string {
  const env = import.meta.env.VITE_SPOTIFY_CLIENT_SECRET
  return typeof env === 'string' ? env.trim() : ''
}

export function isSpotifyConfigured(): boolean {
  return spotifyClientId().length > 0
}

/** Exact redirect URI that must be allow-listed on the Spotify app. */
export function spotifyRedirectUri(): string {
  if (typeof window === 'undefined') return ''
  const base = import.meta.env.BASE_URL || '/'
  const path = base.endsWith('/') ? base : `${base}/`
  return `${window.location.origin}${path}`
}

function base64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function randomVerifier(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return base64Url(bytes)
}

async function challengeFor(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return base64Url(new Uint8Array(digest))
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function getSpotifyTokens(): SpotifyTokens | null {
  const tokens = readJson<SpotifyTokens>(TOKENS_KEY)
  if (!tokens?.accessToken || !tokens.refreshToken || !tokens.expiresAt) {
    return null
  }
  return tokens
}

export function isSpotifyLinked(): boolean {
  return getSpotifyTokens() != null
}

function saveTokens(tokens: SpotifyTokens) {
  localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens))
  emitAuth()
}

export function clearSpotifyAuth() {
  try {
    localStorage.removeItem(TOKENS_KEY)
    localStorage.removeItem(DEVICE_KEY)
  } catch {
    /* private mode */
  }
  emitAuth()
}

export function isSpotifyCallback(): boolean {
  if (typeof window === 'undefined') return false
  const params = new URLSearchParams(window.location.search)
  if (!sessionStorage.getItem(PKCE_KEY)) return false
  return params.has('code') || params.has('error')
}

export async function beginSpotifyLogin(roomId: string): Promise<void> {
  const clientId = spotifyClientId()
  if (!clientId) throw new Error('Spotify is not configured')

  const verifier = randomVerifier()
  const state = randomVerifier()
  const challenge = await challengeFor(verifier)
  const pending: PendingPkce = { verifier, state, roomId }
  sessionStorage.setItem(PKCE_KEY, JSON.stringify(pending))
  sessionStorage.setItem(RETURN_ROOM_KEY, roomId)

  const url = new URL('https://accounts.spotify.com/authorize')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('redirect_uri', spotifyRedirectUri())
  url.searchParams.set('code_challenge_method', 'S256')
  url.searchParams.set('code_challenge', challenge)
  url.searchParams.set('state', state)
  url.searchParams.set('scope', SCOPES)
  window.location.assign(url.toString())
}

type TokenResponse = {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  error?: string
  error_description?: string
}

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const secret = spotifyClientSecret()
  if (secret) body.client_secret = secret
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  })
  const data = (await response.json()) as TokenResponse
  if (!response.ok) {
    throw new Error(data.error_description || data.error || 'Spotify token request failed')
  }
  return data
}

function applyTokenResponse(
  data: TokenResponse,
  previous: SpotifyTokens | null,
): SpotifyTokens {
  if (!data.access_token) throw new Error('Spotify did not return an access token')
  const refreshToken = data.refresh_token || previous?.refreshToken
  if (!refreshToken) throw new Error('Spotify did not return a refresh token')
  const expiresIn = typeof data.expires_in === 'number' ? data.expires_in : 3600
  return {
    accessToken: data.access_token,
    refreshToken,
    expiresAt: Date.now() + Math.max(30, expiresIn - 60) * 1000,
    displayName: previous?.displayName,
  }
}

function takePendingPkce(): PendingPkce | null {
  try {
    const raw = sessionStorage.getItem(PKCE_KEY)
    sessionStorage.removeItem(PKCE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as PendingPkce
  } catch {
    return null
  }
}

function stripOauthParams() {
  const url = new URL(window.location.href)
  url.searchParams.delete('code')
  url.searchParams.delete('state')
  url.searchParams.delete('error')
  url.searchParams.delete('error_description')
  window.history.replaceState(null, '', url.pathname + url.search + url.hash)
}

export type SpotifyAuthResult = {
  roomId: string | null
  error?: string
}

let completeInFlight: Promise<SpotifyAuthResult> | null = null

/** Finish the redirect. Strips OAuth query params from the address bar. */
export async function completeSpotifyAuth(): Promise<SpotifyAuthResult> {
  if (completeInFlight) return completeInFlight
  completeInFlight = finishSpotifyAuth()
  return completeInFlight
}

export function consumeSpotifyReturnRoom(): string | null {
  try {
    const roomId = sessionStorage.getItem(RETURN_ROOM_KEY)
    if (roomId) sessionStorage.removeItem(RETURN_ROOM_KEY)
    return roomId
  } catch {
    return null
  }
}

async function finishSpotifyAuth(): Promise<SpotifyAuthResult> {
  const params = new URLSearchParams(window.location.search)
  const pending = takePendingPkce()
  stripOauthParams()

  if (!pending) return { roomId: null, error: 'Spotify login expired — try again' }

  const error = params.get('error')
  if (error) {
    const description = params.get('error_description')
    return {
      roomId: pending.roomId,
      error: description || error,
    }
  }

  const code = params.get('code')
  const state = params.get('state')
  if (!code) return { roomId: pending.roomId, error: 'Spotify did not return a code' }
  if (state !== pending.state) {
    return { roomId: pending.roomId, error: 'Spotify login state mismatch' }
  }

  const data = await tokenRequest({
    grant_type: 'authorization_code',
    code,
    redirect_uri: spotifyRedirectUri(),
    client_id: spotifyClientId(),
    code_verifier: pending.verifier,
  })
  saveTokens(applyTokenResponse(data, null))
  return { roomId: pending.roomId }
}

export async function getValidSpotifyAccessToken(
  forceRefresh = false,
): Promise<string> {
  const tokens = getSpotifyTokens()
  if (!tokens) throw new Error('Spotify is not connected')
  if (!forceRefresh && Date.now() < tokens.expiresAt) return tokens.accessToken

  const data = await tokenRequest({
    grant_type: 'refresh_token',
    refresh_token: tokens.refreshToken,
    client_id: spotifyClientId(),
  })
  const next = applyTokenResponse(data, tokens)
  saveTokens(next)
  return next.accessToken
}

export function setSpotifyDisplayName(name: string) {
  const tokens = getSpotifyTokens()
  if (!tokens) return
  if (tokens.displayName === name) return
  saveTokens({ ...tokens, displayName: name })
}
