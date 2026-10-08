import type { ReactNode } from 'react'
import { CommunityContext } from '../community/context'

/** Local fixture identity. Preview-aware reporting components never submit for it. */
export function ReportingPreviewContext({ children }: { children: ReactNode }) {
  return <CommunityContext.Provider value={{ session: { available: true, admin: false, user: { id: 'local-reporting-preview', username: 'preview', displayName: 'Local preview', verified: true } }, developer: null, catalog: [], refresh: async () => {}, refreshDeveloper: async () => {}, preview: true }}>{children}</CommunityContext.Provider>
}
