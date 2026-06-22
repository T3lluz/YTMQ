import { Navigate, useParams } from 'react-router-dom'

/**
 * Legacy host route. The host now uses the same view as guests, with all
 * host-only controls living in the in-room Admin tab, so `/host/:roomId`
 * simply forwards to `/room/:roomId` (the stored host token still unlocks the
 * Admin tab there). Kept around so older links / QR codes keep working.
 */
export function Host() {
  const { roomId } = useParams<{ roomId: string }>()
  return <Navigate to={roomId ? `/room/${roomId}` : '/'} replace />
}
