type Options = { api?: string; token?: string | null; fetch?: (url: string, init: RequestInit) => Promise<Response> }
export type BoardReply = { id: string; author: string; body: string; createdAt: string }
export type BoardThread = { id: string; kind: 'question' | 'finding'; topic: { kind: string; key: string }; author: string; to: string | null; body: string; pullRequest: number | null; createdAt: string; activeAt: string; endsAt?: string; endedAt?: string; endedReason?: string; replies: BoardReply[] }
export function listMessages(filter?: Record<string, string | boolean | undefined>, options?: Options): Promise<{ messages: BoardThread[]; ended?: BoardThread[] }>
export function post(item: { kind: 'question' | 'finding'; topic: string; key: string; body: string; to?: string; pullRequest?: number }, options?: Options): Promise<{ message: BoardThread }>
export function messageAction(id: string, action: 'reply' | 'close' | 'fold' | 'delete', body?: Record<string, unknown>, options?: Options): Promise<{ message: BoardThread; deleted?: string }>
export function inboxNotes(options?: Options): Promise<string[]>
export function activity(options?: Options): Promise<{ days: number; developers: { signedIn: number; active: number }; claims: { active: number; made: number }; questions: { open: number }; findings: { active: number }; posts: number }>
export function moduleMessagesLine(input: { machine: string; id: string; messages?: BoardThread[]; login?: string | null }): { state: 'info'; name: string; detail: string } | null
