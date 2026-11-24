import { invoke } from "@tauri-apps/api/core";
import type {
  ArchiveDatabaseResult,
  ArchiveTransactionExecutor,
  ArchiveTransactionStatement,
} from "./archiveTypes.ts";

function normalizeValue(value: unknown): unknown {
  return value === undefined ? null : value;
}

export const executeArchiveTransaction: ArchiveTransactionExecutor = async (
  statements: readonly ArchiveTransactionStatement[],
): Promise<ArchiveDatabaseResult[]> => invoke<ArchiveDatabaseResult[]>(
  "execute_archive_transaction",
  {
    statements: statements.map((statement) => ({
      sql: statement.sql,
      values: statement.values.map(normalizeValue),
    })),
  },
);
