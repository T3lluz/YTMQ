import { createYtmqClient } from './ytmqClient'

/**
 * Absolute URL of the YTMQ server's API. Same origin as the app
 * (t3lluz.com/ytmq/api) unless VITE_API_URL points elsewhere, e.g. a local
 * dev server talking to the live API.
 */
export function apiUrl(): string {
  const fromEnv = import.meta.env.VITE_API_URL?.trim().replace(/\/$/, '')
  if (fromEnv) return fromEnv
  return new URL(`${import.meta.env.BASE_URL}api`, window.location.origin).href
}

export const ytmq = createYtmqClient(apiUrl())
