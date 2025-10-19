export interface MessagePaginationState {
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface MessagePaginationUpdateOptions {
  reset?: boolean;
  hasMore: boolean;
  limit?: number;
}

export function createInitialMessagePagination(limit: number): MessagePaginationState {
  return {
    limit,
    offset: 0,
    hasMore: false,
  };
}

export function applyMessagePaginationUpdate(
  prev: MessagePaginationState,
  receivedCount: number,
  options: MessagePaginationUpdateOptions,
): MessagePaginationState {
  const limit = options.limit ?? prev.limit;
  const safeCount = Math.max(0, receivedCount);
  const nextOffset = options.reset ? safeCount : prev.offset + safeCount;

  return {
    limit,
    offset: nextOffset,
    hasMore: options.hasMore,
  };
}
