import { Icon } from '../components/Icon'
import { communityModule } from './modules'
import { REQUEST_STATUSES, type ForumThread } from './forum-contract'
import { ForumAuthorName, ForumAvatar, ForumCategoryBadge, ForumMachineBadge } from './ForumIdentity'
import { ForumTime } from './ForumTime'
import { threadHref } from '../routing'
import { Skeleton } from './ForumSkeleton'

const TITLE_WIDTHS = ['72%', '54%', '64%', '46%']
/** The list's loading state: the same columns and rows as a loaded page, with bars in place of the text. */
export function ForumThreadListSkeleton({ rows = 6 }: { rows?: number }) {
  return <div className="forum-thread-list" role="status" aria-busy="true">
    <span className="sr-only">Loading discussions…</span>
    <div className="forum-list-columns" aria-hidden="true"><span>Discussion</span><span>Replies</span><span>Last active</span></div>
    <ul className="forum-thread-items" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => <li key={index}>
        <div className="forum-thread-row">
          <div className="forum-thread-summary">
            <span className="forum-avatar forum-skeleton-box" />
            <div className="forum-thread-copy">
              <h3><Skeleton width={TITLE_WIDTHS[index % TITLE_WIDTHS.length]} /></h3>
              <div className="forum-thread-tags"><span className="forum-category-badge"><Skeleton width="64px" /></span><span className="forum-category-badge"><Skeleton width="52px" /></span></div>
            </div>
          </div>
          <span className="forum-reply-count"><Skeleton width="22px" /></span>
          {/* An anchor without href is not a link; it borrows the loaded row's sizing. */}
          <span className="forum-last-active"><a><Skeleton width="44px" /><small><Skeleton width="56px" /></small></a></span>
        </div>
      </li>)}
    </ul>
  </div>
}

export function ForumThreadList({ threads }: { threads: ForumThread[] }) {
  return <div className="forum-thread-list">
    <div className="forum-list-columns" aria-hidden="true"><span>Discussion</span><span>Replies</span><span>Last active</span></div>
    <ul className="forum-thread-items" aria-label="Discussions">
      {threads.map(thread => <li key={thread.id}>
        <article className="forum-thread-row" data-pinned={!!thread.pinned} data-unread={!!thread.unread} aria-labelledby={'thread-title-' + thread.id}>
          <div className="forum-thread-summary">
            <ForumAvatar username={thread.username} official={thread.official} avatar={thread.avatar} />
            <div className="forum-thread-copy">
              <div className="forum-thread-states">
                {!!thread.new_replies && <span className="forum-state" data-new="true">{thread.new_replies} new</span>}
                {!!thread.pinned && <span className="forum-state"><Icon name="pin" size={13} />Pinned</span>}
                {!!thread.locked && <span className="forum-state"><Icon name="lock" size={13} />Locked</span>}
                {thread.category === 'issues' && <span className="forum-state" data-resolved={thread.status === 'resolved'}>{thread.status === 'resolved' && <Icon name="check" size={13} />}{thread.status === 'resolved' ? 'Resolved' : 'Open issue'}</span>}
                {thread.category === 'requests' && <span className="forum-state" data-request-status={thread.request_status}>{thread.request_status === 'shipped' && <Icon name="check" size={13} />}{REQUEST_STATUSES[thread.request_status]}</span>}
              </div>
              <h3 id={'thread-title-' + thread.id}><a className="forum-thread-title" href={threadHref(thread.id, thread.title)}>{!!thread.unread && <span className="sr-only">Unread: </span>}{thread.title}</a></h3>
              <div className="forum-thread-tags">
                <ForumCategoryBadge category={thread.category} />
                {thread.media_kinds && <span className="forum-thread-media">{thread.media_kinds.includes('image') && <><Icon name="image" size={14} /><span className="sr-only">Includes images</span></>}{thread.media_kinds.includes('audio') && <><Icon name="wave" size={14} /><span className="sr-only">Includes sound clips</span></>}</span>}
                {(thread.category === 'requests' || thread.votes > 0) && <span className="forum-votes" data-request={thread.category === 'requests'}><Icon name="heart" size={13} />{thread.votes} {thread.category === 'requests' ? (thread.votes === 1 ? 'vote' : 'votes') : <span className="sr-only">{thread.votes === 1 ? 'like' : 'likes'}</span>}</span>}
                <ForumMachineBadge machine={thread.machine} />
                {thread.module_id && <a className="forum-module-link" href={communityModule(thread.module_id)?.href ?? '#forum'}>{communityModule(thread.module_id)?.name ?? thread.module_id}</a>}
                <span className="forum-thread-author"><ForumAuthorName username={thread.username} official={thread.official} /></span>
              </div>
            </div>
          </div>
          <span className="forum-reply-count"><Icon name="message" size={15} /><span>{thread.replies}</span><span className="sr-only">{thread.replies === 1 ? 'reply' : 'replies'}</span></span>
          <span className="forum-last-active"><a href={threadHref(thread.id, thread.title, thread.last_post_id ? '?post=' + thread.last_post_id + '&page=' + (thread.last_post_page ?? 0) : '')} title={thread.last_excerpt ?? undefined}><span className="sr-only">Latest activity: </span><ForumTime value={thread.updated_at} relative />{thread.last_username && <small>@{thread.last_username}</small>}</a></span>
        </article>
      </li>)}
    </ul>
  </div>
}
