import type { ArchiveDatabase, ArchiveDatabaseResult } from "./archiveTypes.ts";

/**
 * plugin-sql 的 Database 实例只有一个连接状态；事务期间不能让其他
 * select/execute 插入同一个连接。队列按底层 Database 实例共享，确保
 * connection store、回看页面和设置操作不会各自持有一把锁。
 */
export class ArchiveDatabaseQueue implements ArchiveDatabase {
  private tail: Promise<void> = Promise.resolve();

  constructor(private readonly database: ArchiveDatabase) {}

  async execute(query: string, bindValues: unknown[] = []): Promise<ArchiveDatabaseResult> {
    return this.runExclusive((database) => database.execute(query, bindValues));
  }

  async select<T>(query: string, bindValues: unknown[] = []): Promise<T> {
    return this.runExclusive((database) => database.select<T>(query, bindValues));
  }

  /**
   * 读取一个可接受轻微并发的快照。调用方必须只使用读取结果生成带条件的
   * 更新，不能在回调里开启事务或依赖读取与写入之间的原子性。
   */
  runSnapshot<T>(operation: (database: ArchiveDatabase) => Promise<T>): Promise<T> {
    return operation(this.database);
  }

  /** 让一组命令在同一排他区间内完成；事务调用方在回调里直接使用原始连接。 */
  runExclusive<T>(operation: (database: ArchiveDatabase) => Promise<T>): Promise<T> {
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });

    return previous
      .then(() => operation(this.database))
      .finally(() => release());
  }
}

const queues = new WeakMap<object, ArchiveDatabaseQueue>();

export function getArchiveDatabaseQueue(database: ArchiveDatabase): ArchiveDatabaseQueue {
  const existing = queues.get(database);
  if (existing) return existing;
  const queue = new ArchiveDatabaseQueue(database);
  queues.set(database, queue);
  return queue;
}
