import type { ForumCategory } from './forum-contract'

export type UnansweredThreadsPage = {
  total: number
  page: number
  pageSize: number
  category: ForumCategory | 'all'
  order: 'oldest' | 'newest'
  generatedAt: string
  threads: { id: string; title: string; createdAt: string }[]
}

export type AdminActivityDay = {
  day: string
  /** Threads started by members; the automatic module threads are excluded. */
  threads: number
  /** Visible replies in forum threads and comments on module pages. */
  replies: number
  shouts: number
  issuesOpened: number
  issuesClosed: number
}
export type AdminActivity = {
  generatedAt: string
  from: string
  to: string
  days: number
  /** One row per UTC day from `from` to `to`, including quiet days. */
  daily: AdminActivityDay[]
  /** How the threads started in this period were first answered by someone other than their author. */
  firstReplies: { threads: number; answered: number; within48h: number; medianHours: number | null }
  /** Open, unlocked member threads older than 48 hours without a visible reply from anyone else; oldest first. */
  unanswered: { total: number; threads: { id: string; title: string; createdAt: string }[] }
  /** Issues closed in this period and how long they had been open; reopened issues count from their latest closing. */
  issueTurnaround: { closed: number; medianDays: number | null; within7Days: number }
  /** Closed issues whose closing time was never recorded (closed before tracking began, without a reporter notification). */
  unknownCloseTimes: number
}
