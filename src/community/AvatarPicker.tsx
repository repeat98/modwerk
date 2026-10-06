import { useRef, useState } from 'react'
import { apiFetch } from './api'
import { useCommunity } from './context'
import { Icon } from '../components/Icon'
import { ForumAvatar } from './ForumIdentity'
import { compressAvatar } from './forum-media-client'

/** Set or remove the member's profile picture. The browser crops it square and shrinks it before the upload. */
export function AvatarPicker() {
  const { session, refresh } = useCommunity(), input = useRef<HTMLInputElement>(null), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const user = session.user
  if (!user?.verified || !session.forumMedia) return null
  async function send(request: Promise<Response>) {
    setBusy(true); setError('')
    try {
      const result = await request
      if (!result.ok) throw new Error(((await result.json().catch(() => ({}))) as {error?: string}).error ?? 'Your profile picture could not be saved.')
      await refresh()
    } catch (error) { setError(error instanceof Error ? error.message : 'Your profile picture could not be saved.') } finally { setBusy(false) }
  }
  async function choose(file: File) {
    let blob: Blob
    try { blob = await compressAvatar(file) } catch (error) { setError(error instanceof Error ? error.message : 'This image could not be read.'); return }
    await send(apiFetch('/forum/avatar', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: blob }))
  }
  return <div className="account-avatar">
    <ForumAvatar username={user.username} avatar={user.avatar} />
    <div>
      <h3>Profile picture</h3>
      <p>Shown beside your posts and messages. It is cropped to a square and shrunk to 512 pixels in your browser; photo location data is removed.</p>
      <div className="forum-actions">
        <button type="button" className="button button-quiet" disabled={busy} onClick={() => input.current?.click()}><Icon name="image" size={15} />{busy ? 'Saving…' : user.avatar ? 'Change picture' : 'Add a picture'}</button>
        {user.avatar && <button type="button" className="text-button" disabled={busy} onClick={() => void send(apiFetch('/forum/avatar', { method: 'DELETE' }))}>Remove</button>}
      </div>
      {error && <p className="file-error" role="alert">{error}</p>}
    </div>
    <input ref={input} type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void choose(file) }} />
  </div>
}
