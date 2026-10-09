import { getApiUrl } from './helpers/api'

export default async function globalSetup() {
  const res = await fetch(`${getApiUrl()}/health`).catch(() => null)
  if (!res?.ok) {
    throw new Error(
      `YTMQ server not reachable at ${getApiUrl()}. Start it with: cd server && deno task dev`,
    )
  }
}
