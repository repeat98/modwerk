import { CommunityProvider } from './community/CommunityContext'
import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import { startRouting } from './routing'
import { MODULES } from './catalog/modules'

startRouting(MODULES.map(module => module.id))
const ReportingPreview = import.meta.env.DEV ? lazy(() => import('./components/ReportingPreview')) : () => null
const preview = import.meta.env.DEV ? new URLSearchParams(window.location.search).get('preview') : null

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {preview === 'reporting' || preview === 'reporting-module' ? <Suspense fallback={<p>Opening reporting previews…</p>}><ReportingPreview modulePage={preview === 'reporting-module'}/></Suspense> : <CommunityProvider><App /></CommunityProvider>}
  </StrictMode>,
)
