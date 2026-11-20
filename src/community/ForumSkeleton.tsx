/** A grey bar standing in for text that is still loading. Put it inside the element the text will fill, so the line
 * already has the height and spacing it keeps once loaded and nothing moves when the content arrives. */
export function Skeleton({ width = '60%' }: { width?: string }) {
  return <span className="forum-skeleton" style={{ width }} aria-hidden="true" />
}

/** Placeholder articles for the sidebar's reply lists, laid out like the loaded ones. */
export function ForumRecentSkeleton({ count = 3, author = true }: { count?: number; author?: boolean }) {
  return <div className="forum-recent-skeleton" role="status" aria-busy="true"><span className="sr-only">Loading replies…</span>
    {Array.from({ length: count }, (_, index) => <article key={index} aria-hidden="true">
      <div className="forum-meta">{author && <span className="forum-author"><span className="forum-avatar forum-skeleton-box" /><Skeleton width="64px" /></span>}<Skeleton width="48px" /></div>
      <h3><Skeleton width={index % 2 ? '70%' : '88%'} /></h3>
      <p><Skeleton width="100%" /><br /><Skeleton width="62%" /></p>
    </article>)}
  </div>
}
