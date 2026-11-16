import type { ReactNode } from 'react';
import { FilterX, Inbox } from 'lucide-react';

/**
 * One empty state for the whole application, with the two cases that were being
 * confused on screen (Part 5.1):
 *
 *  - `filtered`: there are records, the current filter hides them all. The only
 *    useful action is to clear the filter, and the copy must say that the data
 *    is not missing.
 *  - `empty`: there are no records at all. The action is the page's own
 *    next step (import data, create a scenario, generate a report…).
 *
 * Nothing here invents a record or a count, and the copy never suggests work has
 * been lost when it has only been filtered out.
 */
export function EmptyState({
  variant = 'empty',
  title,
  description,
  action,
  onClearFilter,
  filterLabel,
  compact = false,
}: {
  variant?: 'filtered' | 'empty';
  title: string;
  description: string;
  action?: ReactNode;
  /** Required for `filtered`: what the user is filtering on, and how to undo it. */
  onClearFilter?: () => void;
  filterLabel?: string;
  compact?: boolean;
}) {
  const filtered = variant === 'filtered';
  return (
    <div className={`empty-state ${filtered ? 'is-filtered' : 'is-empty'} ${compact ? 'compact' : ''}`}>
      <span className="empty-state-icon">
        {filtered ? <FilterX size={24} /> : <Inbox size={26} />}
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      <div className="empty-state-actions">
        {filtered
          ? onClearFilter && (
              <button type="button" className="btn btn-secondary" onClick={onClearFilter}>
                {filterLabel ? `Clear filter (${filterLabel})` : 'Clear filter'}
              </button>
            )
          : action}
      </div>
    </div>
  );
}
