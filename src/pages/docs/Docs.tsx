import { lazy, Suspense } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { DocsLayout } from './DocsLayout'
import { DOC_PAGES } from './nav'

const PAGES = {
  '': lazy(() => import('./pages/Overview')),
  install: lazy(() => import('./pages/Install')),
  hosting: lazy(() => import('./pages/Hosting')),
  guests: lazy(() => import('./pages/Guests')),
  extension: lazy(() => import('./pages/Extension')),
  spotify: lazy(() => import('./pages/Spotify')),
  shortcuts: lazy(() => import('./pages/Shortcuts')),
  'how-it-works': lazy(() => import('./pages/HowItWorks')),
  api: lazy(() => import('./pages/Api')),
  privacy: lazy(() => import('./pages/Privacy')),
  troubleshooting: lazy(() => import('./pages/Troubleshooting')),
  changelog: lazy(() => import('./pages/Changelog')),
} as const

export default function Docs() {
  const { slug = '' } = useParams<{ slug: string }>()
  const page = DOC_PAGES.find((p) => p.slug === slug)
  const Page = PAGES[slug as keyof typeof PAGES]
  if (!page || !Page) return <Navigate to="/docs" replace />
  return (
    <DocsLayout page={page}>
      <Suspense fallback={<div className="mt-10 h-40 rounded-2xl ytmq-skeleton" />}>
        <Page />
      </Suspense>
    </DocsLayout>
  )
}
