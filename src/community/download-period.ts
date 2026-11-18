import { createContext } from 'react'
import type { DownloadDays } from './module-statistics'

// The period the library's download sort counts over, so each card shows the count its place in the order comes from.
export const DownloadPeriodContext = createContext<DownloadDays>(0)
