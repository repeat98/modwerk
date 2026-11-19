import { CommunityProvider } from './community/CommunityContext'
import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import './desktop-shell.css'
import { markDesktopShell } from './desktop-shell'
import { startRouting } from './routing'
import { MODULES } from './catalog/modules'
import { PublicAudioPreviews } from './components/PublicAudioPreviews'
import { PageError } from './components/PageError'
import { RenderBoundary } from './components/RenderBoundary'

startRouting(MODULES.map(module => module.id))
markDesktopShell(document.documentElement)
const ReportingPreview = import.meta.env.DEV ? lazy(() => import('./components/ReportingPreview')) : () => null
const AudioPreviewPrototype = import.meta.env.DEV ? lazy(() => import('./components/AudioPreviewPrototype')) : () => null
const preview = import.meta.env.DEV ? new URLSearchParams(window.location.search).get('preview') : null

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RenderBoundary fallback={error => <PageError error={error} scope="app" />}>
      {preview === 'audio' ? <Suspense fallback={<p>Opening audio previews…</p>}><AudioPreviewPrototype/></Suspense> : preview === 'reporting' || preview === 'reporting-module' ? <Suspense fallback={<p>Opening reporting previews…</p>}><ReportingPreview modulePage={preview === 'reporting-module'}/></Suspense> : <CommunityProvider><PublicAudioPreviews><App /></PublicAudioPreviews></CommunityProvider>}
    </RenderBoundary>
  </StrictMode>,
)
