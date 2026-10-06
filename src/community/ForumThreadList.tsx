import { Icon } from '../components/Icon'
import { communityModule } from './modules'
import type { ForumThread } from './forum-contract'
import { ForumAuthorName, ForumAvatar, ForumCategoryBadge, ForumMachineBadge } from './ForumIdentity'
import { ForumTime } from './ForumTime'

export function ForumThreadList({ threads }: { threads: ForumThread[] }) {
  return <div className="forum-thread-list">
    <div className="forum-list-columns" aria-hidden="true"><span>Discussion</span><span>Replies</span><span>Last active</span></div>
    <ul className="forum-thread-items" aria-label="Discussions">
      {threads.map(thread => <li key={thread.id}>
        <article className="forum-thread-row" data-pinned={!!thread.pinned} aria-labelledby={'thread-title-' + thread.id}>
          <div className="forum-thread-summary">
            <ForumAvatar username={thread.username} official={thread.official} avatar={thread.avatar} />
            <div className="forum-thread-copy">
              <div className="forum-thread-states">
                {!!thread.pinned && <span className="forum-state"><Icon name="pin" size={13} />Pinned</span>}
                {!!thread.locked && <span className="forum-state"><Icon name="lock" size={13} />Locked</span>}
                {thread.category === 'issues' && <span className="forum-state" data-resolved={thread.status === 'resolved'}>{thread.status === 'resolved' && <Icon name="check" size={13} />}{thread.status === 'resolved' ? 'Resolved' : 'Open issue'}</span>}
              </div>
              <h3 id={'thread-title-' + thread.id}><a className="forum-thread-title" href={'#forum/thread/' + thread.id}>{thread.title}</a></h3>
              <div className="forum-thread-tags">
                <ForumCategoryBadge category={thread.category} />
                {thread.media_kinds && <span className="forum-thread-media">{thread.media_kinds.includes('image') && <><Icon name="image" size={14} /><span className="sr-only">Includes images</span></>}{thread.media_kinds.includes('audio') && <><Icon name="wave" size={14} /><span className="sr-only">Includes sound clips</span></>}</span>}
                <ForumMachineBadge machine={thread.machine} />
                {thread.module_id && <a className="forum-module-link" href={communityModule(thread.module_id)?.href ?? '#forum'}>{communityModule(thread.module_id)?.name ?? thread.module_id}</a>}
                <span className="forum-thread-author"><ForumAuthorName username={thread.username} official={thread.official} /></span>
              </div>
            </div>
          </div>
          <span className="forum-reply-count"><Icon name="message" size={15} /><span>{thread.replies}</span><span className="sr-only">{thread.replies === 1 ? 'reply' : 'replies'}</span></span>
          <span className="forum-last-active"><a href={'#forum/thread/' + thread.id + (thread.last_post_id ? '?post=' + thread.last_post_id + '&page=' + (thread.last_post_page ?? 0) : '')} title={thread.last_excerpt ?? undefined}><span className="sr-only">Latest activity: </span><ForumTime value={thread.updated_at} relative />{thread.last_username && <small>@{thread.last_username}</small>}</a></span>
        </article>
      </li>)}
    </ul>
  </div>
}
