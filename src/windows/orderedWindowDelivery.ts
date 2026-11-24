export function createOrderedWindowDelivery() {
  let tail: Promise<unknown> = Promise.resolve();
  return (send: () => Promise<unknown>): Promise<unknown> => {
    const delivery = tail.then(send);
    tail = delivery.catch(() => {});
    return delivery;
  };
}

export function createBatchedWindowDelivery<T>(
  deliver: (send: () => Promise<unknown>) => Promise<unknown>,
  send: (items: readonly T[]) => Promise<unknown>,
) {
  type Entry = { item: T; resolve: (value: unknown) => void; reject: (error: unknown) => void };
  let pending: Entry[] | undefined;
  const enqueue = (item: T): Promise<unknown> => new Promise((resolve, reject) => {
    if (pending) { pending.push({ item, resolve, reject }); return; }
    const batch: Entry[] = [{ item, resolve, reject }];
    pending = batch;
    void deliver(async () => {
      if (pending === batch) pending = undefined;
      try {
        const result = await send(batch.map(entry => entry.item));
        batch.forEach(entry => entry.resolve(result));
      } catch (error) {
        batch.forEach(entry => entry.reject(error));
      }
    });
  });
  return Object.assign(enqueue, { seal() { pending = undefined; } });
}
