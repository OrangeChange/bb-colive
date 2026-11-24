import { useEffect, useState } from "react";
import { ArchiveRepository, openArchiveDatabase, reconcileStaleArchiveSessions } from "./archiveRepository.ts";
import type { ArchiveRepositoryContract } from "./archiveTypes.ts";
import { recordArchiveDiagnostic } from "./archiveDiagnostics.ts";
import { recordFeatureDiagnostic } from "../diagnostics/featureDiagnostics.ts";
import { ARCHIVE_SCHEMA_VERSION } from "./archiveSchema.ts";
import { notifyArchiveRevision } from "./archiveRuntime.ts";
import { migrateLegacyFavorites } from "../eventAnnotations.ts";
import { useVoiceSettings } from "../voice/voiceSettings";

export function useArchiveInitialization() {
  const [archiveRepository, setArchiveRepository] = useState<ArchiveRepositoryContract | null>(null);
  useEffect(() => {
    let disposed = false;
    void openArchiveDatabase()
      .then((database) => {
        const repository = new ArchiveRepository(database);
        return reconcileStaleArchiveSessions(repository)
          .then((reconciled) => {
            if (reconciled > 0) {
              recordArchiveDiagnostic("success", "archive-recovery", "reconciled", {
                count: reconciled,
                data: { reason: "previous-runtime" },
              });
            }
            if (disposed) return repository;
            return repository;
          })
          .catch((error) => {
            recordArchiveDiagnostic("failure", "archive-recovery", "failed", {
              data: { reason: "previous-runtime", error: error instanceof Error ? error.message : String(error) },
            });
            return repository;
          });
      })
      .then(async (repository) => {
        if (disposed) return repository;
        try {
          const corrected = await repository.recomputeEventCounts();
          if (corrected > 0) {
            recordArchiveDiagnostic("success", "archive-summary", "event-counts-reconciled", {
              count: corrected,
              data: { reason: "startup-maintenance" },
            });
          }
        } catch (error) {
          recordArchiveDiagnostic("failure", "archive-summary", "event-count-reconcile-failed", {
            data: { reason: "startup-maintenance", error: error instanceof Error ? error.message : String(error) },
          });
        }
        return repository;
      })
      .then((repository) => {
        if (disposed) return repository;
        // Repository 在迁移之前就可用；迁移失败不能阻塞本次会话的收藏/昵称操作。
        setArchiveRepository(repository);
        recordArchiveDiagnostic("open", "archive-open", "opened", {
          data: { schemaVersion: ARCHIVE_SCHEMA_VERSION },
        });
        void repository.recomputePaidTotals()
          .then((updated) => {
            if (disposed) return;
            recordArchiveDiagnostic("success", "archive-summary", "paid-totals-reconciled", {
              count: updated,
              data: { reason: "background-maintenance" },
            });
            if (updated > 0) notifyArchiveRevision();
          })
          .catch((error) => {
            if (disposed) return;
            recordArchiveDiagnostic("failure", "archive-summary", "paid-totals-reconcile-failed", {
              data: { reason: "background-maintenance", error: error instanceof Error ? error.message : String(error) },
            });
          });
        const nicknames = useVoiceSettings.getState().userNicknames;
        void Promise.all(
          Object.entries(nicknames).map(([uid, nickname]) => repository.setNickname(uid, nickname)),
        ).catch((error) => {
          recordFeatureDiagnostic({
            featureId: "review-archive",
            stage: "failure",
            action: "sync-nicknames",
            outcome: "repository-write-failed",
            data: { error: error instanceof Error ? error.message : String(error) },
          });
        });
        void migrateLegacyFavorites(repository)
          .then((migration) => {
            if (disposed) return;
            recordArchiveDiagnostic("success", "archive-favorite", migration.alreadyMigrated ? "already-migrated" : "completed", {
              count: migration.migrated,
              data: { operation: "migration", unmatched: migration.unmatched },
            });
          })
          .catch((error) => {
            if (disposed) return;
            recordArchiveDiagnostic("failure", "archive-favorite", "failed", {
              data: { operation: "migration", error: error instanceof Error ? error.message : String(error) },
            });
          });
        return repository;
      })
      .catch((error) => {
        if (disposed) return;
        recordArchiveDiagnostic("failure", "archive-open", "unavailable", {
          data: { error: error instanceof Error ? error.message : String(error) },
        });
      });
    return () => {
      disposed = true;
    };
  }, []);


  return archiveRepository;
}
