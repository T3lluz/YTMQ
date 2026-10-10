import { createContext, type ReactNode } from 'react'

/** What every tab's header carries: the rail toggle on its left, the lobby chip on its right (desktop). */
export const RoomChromeContext = createContext<{ leading?: ReactNode; trailing?: ReactNode }>({})
