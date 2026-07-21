/**
 * Pagination helper for list endpoints.
 *
 * Produces consistent cursor-based pagination responses across
 * all list endpoints (assets, transactions, proposals, events).
 *
 * Usage:
 *   const page = paginate(allItems, { limit: 20, cursor: req.query.cursor });
 *   return reply.send(page);
 */

export interface PaginationParams {
  limit?: number;
  cursor?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  cursor: string | null;
  hasMore: boolean;
  total?: number;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * Paginate an array of items using cursor-based pagination.
 *
 * Cursor is expected to be the `id` of the last item from the
 * previous page. Returns the next cursor as the id of the last
 * item in the current page, or null if there are no more items.
 */
export function paginate<T extends { id: string }>(
  allItems: T[],
  params: PaginationParams = {},
): PaginatedResponse<T> {
  const limit = Math.min(Math.max(params.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);

  let startIndex = 0;
  if (params.cursor) {
    const cursorIndex = allItems.findIndex((item) => item.id === params.cursor);
    if (cursorIndex >= 0) {
      startIndex = cursorIndex + 1;
    }
  }

  const items = allItems.slice(startIndex, startIndex + limit);
  const hasMore = startIndex + limit < allItems.length;
  const cursor = items.length > 0 ? items[items.length - 1]!.id : null;

  return {
    items,
    cursor,
    hasMore,
    total: allItems.length,
  };
}
