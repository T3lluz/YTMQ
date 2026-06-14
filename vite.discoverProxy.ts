import type { Plugin } from 'vite'

const YTMUSIC_API_KEY = 'AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX30'
const YTMUSIC_ORIGIN = 'https://music.youtube.com'

/** Dev-only proxy so discover works before the search edge function is redeployed. */
export function discoverProxyPlugin(): Plugin {
  return {
    name: 'ytmq-discover-proxy',
    configureServer(server) {
      server.middlewares.use('/api/ytmusic', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end('Method not allowed')
          return
        }

        const endpoint = req.url?.replace(/^\//, '').split('?')[0] ?? ''
        if (!endpoint) {
          res.statusCode = 400
          res.end('Missing endpoint')
          return
        }

        let body = ''
        req.on('data', (chunk) => {
          body += chunk
        })

        req.on('end', async () => {
          try {
            const upstream = await fetch(
              `${YTMUSIC_ORIGIN}/youtubei/v1/${endpoint}?key=${YTMUSIC_API_KEY}&prettyPrint=false`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Origin: YTMUSIC_ORIGIN,
                  'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
                },
                body,
              },
            )

            const text = await upstream.text()
            res.statusCode = upstream.status
            res.setHeader('Content-Type', 'application/json')
            res.end(text)
          } catch (err) {
            res.statusCode = 502
            res.setHeader('Content-Type', 'application/json')
            res.end(
              JSON.stringify({
                error: err instanceof Error ? err.message : 'Proxy failed',
              }),
            )
          }
        })
      })
    },
  }
}
