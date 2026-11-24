export interface ReviewReadingMemoryPosition {
  eventKey: string;
  eventTs: number;
  offset: number;
  updatedAt: number;
}

export interface ReviewReadingMemoryStore {
  get(sessionId: string): ReviewReadingMemoryPosition | null;
  set(sessionId: string, position: ReviewReadingMemoryPosition): void;
  clear(): void;
}

export function createReviewReadingMemoryStore(): ReviewReadingMemoryStore {
  const positions = new Map<string, ReviewReadingMemoryPosition>();
  return {
    get(sessionId) {
      return positions.get(sessionId) ?? null;
    },
    set(sessionId, position) {
      positions.set(sessionId, position);
    },
    clear() {
      positions.clear();
    },
  };
}
