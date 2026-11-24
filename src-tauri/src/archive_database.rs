use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::sqlite::SqliteConnectOptions;
use sqlx::{Connection, Sqlite, SqliteConnection};
use tauri::{AppHandle, Manager, State};
use tokio::sync::Mutex;

const ARCHIVE_DATABASE_FILE: &str = "archive.sqlite";
const ARCHIVE_BUSY_TIMEOUT: Duration = Duration::from_secs(5);
const ARCHIVE_TRANSACTION_RETRY_COUNT: usize = 2;
const ARCHIVE_TRANSACTION_RETRY_DELAY: Duration = Duration::from_millis(80);

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveTransactionStatement {
    pub sql: String,
    #[serde(default)]
    pub values: Vec<Value>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveTransactionResult {
    pub rows_affected: u64,
    pub last_insert_id: i64,
}

pub struct ArchiveWriteDatabase {
    pub(crate) connection: Mutex<Option<SqliteConnection>>,
}

impl Default for ArchiveWriteDatabase {
    fn default() -> Self {
        Self {
            connection: Mutex::new(None),
        }
    }
}

impl ArchiveWriteDatabase {
    #[cfg(test)]
    pub(crate) fn with_connection(connection: SqliteConnection) -> Self {
        Self {
            connection: Mutex::new(Some(connection)),
        }
    }

    async fn open_connection(app: &AppHandle) -> Result<SqliteConnection, String> {
        let app_config_dir = crate::data_paths::root()
            .map_err(|error| format!("resolve archive database directory: {error}"))?;
        std::fs::create_dir_all(&app_config_dir)
            .map_err(|error| format!("create archive database directory: {error}"))?;
        let database_path = app_config_dir.join(ARCHIVE_DATABASE_FILE);
        let options = SqliteConnectOptions::new()
            .filename(database_path)
            .create_if_missing(true)
            .foreign_keys(true)
            .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal)
            .busy_timeout(ARCHIVE_BUSY_TIMEOUT);
        SqliteConnection::connect_with(&options)
            .await
            .map_err(|error| format!("open archive write database: {error}"))
    }

    async fn ensure_connection(&self, app: &AppHandle) -> Result<(), String> {
        let mut connection = self.connection.lock().await;
        if connection.is_none() {
            *connection = Some(Self::open_connection(app).await?);
        }
        Ok(())
    }

    pub(crate) async fn execute_on_connection(
        &self,
        statements: Vec<ArchiveTransactionStatement>,
    ) -> Result<Vec<ArchiveTransactionResult>, String> {
        let mut connection = self.connection.lock().await;
        let connection = connection
            .as_mut()
            .ok_or_else(|| "archive write database is not initialized".to_string())?;
        let result = execute_transaction(connection, &statements).await;
        match result {
            Err(error) if is_unfinished_transaction_error(&error) => {
                // 上一次事务可能在驱动层异常后仍留在连接上。先回滚遗留状态，
                // 再只重试当前这一个事务，避免把失败批次静默丢掉。
                if sqlx::query("ROLLBACK")
                    .execute(&mut *connection)
                    .await
                    .is_ok()
                {
                    execute_transaction(connection, &statements).await
                } else {
                    Err(error)
                }
            }
            result => result,
        }
    }

    async fn execute(
        &self,
        app: &AppHandle,
        statements: Vec<ArchiveTransactionStatement>,
    ) -> Result<Vec<ArchiveTransactionResult>, String> {
        self.ensure_connection(app).await?;
        let result = self.execute_on_connection(statements).await;
        if let Err(error) = &result {
            if should_reset_connection(error) {
                self.reset_connection().await;
            }
        }
        result
    }

    async fn reset_connection(&self) {
        let mut connection = self.connection.lock().await;
        if let Some(connection) = connection.take() {
            let _ = connection.close().await;
        }
    }
}

fn is_database_lock_error(error: &str) -> bool {
    let error = error.to_ascii_lowercase();
    error.contains("database is locked")
        || error.contains("database table is locked")
        || error.contains("database is busy")
}

fn is_unfinished_transaction_error(error: &str) -> bool {
    error.contains("cannot start a transaction within a transaction")
}

fn should_reset_connection(error: &str) -> bool {
    is_database_lock_error(error) || is_unfinished_transaction_error(error)
}

async fn execute_transaction(
    connection: &mut SqliteConnection,
    statements: &[ArchiveTransactionStatement],
) -> Result<Vec<ArchiveTransactionResult>, String> {
    for attempt in 0..=ARCHIVE_TRANSACTION_RETRY_COUNT {
        match execute_transaction_once(connection, statements).await {
            Ok(results) => return Ok(results),
            Err(error)
                if attempt < ARCHIVE_TRANSACTION_RETRY_COUNT && is_database_lock_error(&error) =>
            {
                let delay = ARCHIVE_TRANSACTION_RETRY_DELAY * (attempt as u32 + 1);
                tokio::time::sleep(delay).await;
            }
            Err(error) => return Err(error),
        }
    }
    unreachable!("archive transaction retry loop must return");
}

async fn execute_transaction_once(
    connection: &mut SqliteConnection,
    statements: &[ArchiveTransactionStatement],
) -> Result<Vec<ArchiveTransactionResult>, String> {
    for statement in statements {
        for value in &statement.values {
            if matches!(value, Value::Number(value) if value.as_f64().is_none()) {
                return Err("archive SQL number is not finite".to_string());
            }
        }
    }
    let mut transaction = connection
        .begin()
        .await
        .map_err(|error| format!("begin archive transaction: {error}"))?;
    let mut results = Vec::with_capacity(statements.len());
    for statement in statements {
        let mut query = sqlx::query::<Sqlite>(&statement.sql);
        for value in &statement.values {
            query = match value {
                Value::Null => query.bind(None::<String>),
                Value::Bool(value) => query.bind(if *value { 1_i64 } else { 0_i64 }),
                Value::Number(value) => {
                    query.bind(value.as_f64().expect("validated archive SQL number"))
                }
                Value::String(value) => query.bind(value.clone()),
                Value::Array(_) | Value::Object(_) => query.bind(value.to_string()),
            };
        }
        let result = match query.execute(&mut *transaction).await {
            Ok(result) => result,
            Err(error) => {
                let rollback = transaction.rollback().await;
                return Err(match rollback {
                    Ok(()) => format!("archive transaction statement failed: {error}"),
                    Err(rollback_error) => format!(
                        "archive transaction statement failed: {error}; rollback failed: {rollback_error}"
                    ),
                });
            }
        };
        results.push(ArchiveTransactionResult {
            rows_affected: result.rows_affected(),
            last_insert_id: result.last_insert_rowid(),
        });
    }
    transaction
        .commit()
        .await
        .map_err(|error| format!("commit archive transaction: {error}"))?;
    Ok(results)
}

#[tauri::command]
pub async fn execute_archive_transaction(
    app: AppHandle,
    state: State<'_, ArchiveWriteDatabase>,
    statements: Vec<ArchiveTransactionStatement>,
) -> Result<Vec<ArchiveTransactionResult>, String> {
    state.execute(&app, statements).await
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use std::sync::Arc;

    use sqlx::sqlite::SqliteConnectOptions;
    use sqlx::{Connection, SqliteConnection};

    use super::{ArchiveTransactionStatement, ArchiveWriteDatabase};

    async fn memory_database() -> ArchiveWriteDatabase {
        let options = SqliteConnectOptions::new()
            .filename(":memory:")
            .foreign_keys(true);
        let mut connection = SqliteConnection::connect_with(&options).await.unwrap();
        sqlx::query("CREATE TABLE archive_test (id INTEGER PRIMARY KEY, value TEXT NOT NULL)")
            .execute(&mut connection)
            .await
            .unwrap();
        ArchiveWriteDatabase::with_connection(connection)
    }

    async fn row_count(database: &ArchiveWriteDatabase) -> i64 {
        let mut connection = database.connection.lock().await;
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM archive_test")
            .fetch_one(connection.as_mut().unwrap())
            .await
            .unwrap()
    }

    #[test]
    fn transaction_commits_all_statements() {
        tauri::async_runtime::block_on(async {
            let database = memory_database().await;
            let results = database
                .execute_on_connection(vec![
                    ArchiveTransactionStatement {
                        sql: "INSERT INTO archive_test (id, value) VALUES ($1, $2)".to_string(),
                        values: vec![1.into(), "committed".into()],
                    },
                    ArchiveTransactionStatement {
                        sql: "INSERT INTO archive_test (id, value) VALUES ($1, $2)".to_string(),
                        values: vec![2.into(), "also-committed".into()],
                    },
                ])
                .await
                .unwrap();

            assert_eq!(results.len(), 2);
            assert_eq!(results[0].rows_affected, 1);
            assert_eq!(row_count(&database).await, 2);
        });
    }

    #[test]
    fn transaction_rolls_back_when_a_statement_fails() {
        tauri::async_runtime::block_on(async {
            let database = memory_database().await;
            let error = database
                .execute_on_connection(vec![
                    ArchiveTransactionStatement {
                        sql: "INSERT INTO archive_test (id, value) VALUES ($1, $2)".to_string(),
                        values: vec![1.into(), "rolled-back".into()],
                    },
                    ArchiveTransactionStatement {
                        sql: "INSERT INTO missing_table (value) VALUES ($1)".to_string(),
                        values: vec!["failure".into()],
                    },
                ])
                .await
                .expect_err("the second statement must fail");

            assert!(!error.is_empty());
            assert_eq!(row_count(&database).await, 0);
        });
    }

    #[test]
    fn concurrent_batches_are_serialized_on_one_connection() {
        tauri::async_runtime::block_on(async {
            let database = Arc::new(memory_database().await);
            let mut tasks = Vec::new();
            for id in 0..16_i64 {
                let database = Arc::clone(&database);
                tasks.push(tauri::async_runtime::spawn(async move {
                    database
                        .execute_on_connection(vec![ArchiveTransactionStatement {
                            sql: "INSERT INTO archive_test (id, value) VALUES ($1, $2)".to_string(),
                            values: vec![id.into(), format!("batch-{id}").into()],
                        }])
                        .await
                }));
            }

            for task in tasks {
                task.await.unwrap().unwrap();
            }
            assert_eq!(row_count(&database).await, 16);
        });
    }

    #[test]
    fn transaction_retries_after_a_temporary_database_lock() {
        tauri::async_runtime::block_on(async {
            let path = std::env::temp_dir().join(format!(
                "danmu-archive-lock-{}-{}.sqlite",
                std::process::id(),
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_nanos(),
            ));
            let options = SqliteConnectOptions::new()
                .filename(&path)
                .create_if_missing(true)
                .foreign_keys(true)
                .busy_timeout(Duration::from_millis(20));
            let mut writer_connection = SqliteConnection::connect_with(&options).await.unwrap();
            sqlx::query("CREATE TABLE archive_test (id INTEGER PRIMARY KEY, value TEXT NOT NULL)")
                .execute(&mut writer_connection)
                .await
                .unwrap();
            let mut blocker = SqliteConnection::connect_with(&options).await.unwrap();
            sqlx::query("BEGIN EXCLUSIVE")
                .execute(&mut blocker)
                .await
                .unwrap();

            let release = tauri::async_runtime::spawn(async move {
                tokio::time::sleep(Duration::from_millis(45)).await;
                sqlx::query("COMMIT").execute(&mut blocker).await.unwrap();
            });
            let database = ArchiveWriteDatabase::with_connection(writer_connection);
            let result = database
                .execute_on_connection(vec![ArchiveTransactionStatement {
                    sql: "INSERT INTO archive_test (id, value) VALUES ($1, $2)".to_string(),
                    values: vec![1.into(), "after-retry".into()],
                }])
                .await;

            release.await.unwrap();
            assert!(
                result.is_ok(),
                "temporary lock should be retried: {result:?}"
            );
            assert_eq!(row_count(&database).await, 1);
            let _ = std::fs::remove_file(path);
        });
    }

    #[test]
    fn transaction_recovers_from_an_unfinished_previous_transaction() {
        tauri::async_runtime::block_on(async {
            let database = memory_database().await;
            {
                let mut connection = database.connection.lock().await;
                sqlx::query("BEGIN")
                    .execute(connection.as_mut().unwrap())
                    .await
                    .unwrap();
            }

            let result = database
                .execute_on_connection(vec![ArchiveTransactionStatement {
                    sql: "INSERT INTO archive_test (id, value) VALUES ($1, $2)".to_string(),
                    values: vec![1.into(), "after-recovery".into()],
                }])
                .await;

            assert!(
                result.is_ok(),
                "stale transaction should be recovered: {result:?}"
            );
            assert_eq!(row_count(&database).await, 1);
        });
    }
}
