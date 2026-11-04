use crate::{models::Table, settings::Database};
use sqlx::{
    Connection, Row,
    postgres::{PgConnectOptions, PgConnection},
};
use std::path::Path;
use tokio::process::Command;

fn quote(value: &str) -> String {
    format!("\"{}\"", value.replace('"', "\"\""))
}

async fn connection(db: &Database) -> anyhow::Result<PgConnection> {
    Ok(PgConnection::connect_with(
        &PgConnectOptions::new()
            .host(&db.host)
            .port(db.port)
            .database(&db.database)
            .username(&db.username)
            .password(&db.password),
    )
    .await?)
}

pub async fn tables(db: &Database, estimated: bool) -> anyhow::Result<Vec<Table>> {
    let mut conn = connection(db).await?;
    let rows = if estimated {
        sqlx::query("SELECT c.relname AS name, GREATEST(c.reltuples, 0)::bigint AS count FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relkind = 'r' AND n.nspname = $1").bind(&db.schema).fetch_all(&mut conn).await?
    } else {
        sqlx::query(
            "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = $1",
        )
        .bind(&db.schema)
        .fetch_all(&mut conn)
        .await?
    };
    let mut tables = Vec::new();
    for row in rows {
        let name: String = row.try_get("name")?;
        if db.exclude_tables.contains(&name) {
            continue;
        }
        let count = if estimated {
            row.try_get("count")?
        } else {
            sqlx::query_scalar::<_, i64>(&format!(
                "SELECT COUNT(*) FROM {}.{}",
                quote(&db.schema),
                quote(&name)
            ))
            .fetch_one(&mut conn)
            .await?
        };
        tables.push(Table {
            name,
            row_count: count,
        });
    }
    Ok(tables)
}

fn command(program: &str, db: &Database) -> Command {
    let mut command = Command::new(program);
    command
        .env("PGHOST", &db.host)
        .env("PGPORT", db.port.to_string())
        .env("PGDATABASE", &db.database)
        .env("PGUSER", &db.username)
        .env("PGPASSWORD", &db.password)
        .kill_on_drop(true);
    command
}

async fn run(command: &mut Command) -> anyhow::Result<()> {
    let status = command.status().await?;
    anyhow::ensure!(status.success(), "PostgreSQL utility failed: {status}");
    Ok(())
}

pub async fn dump(
    db: &Database,
    output: &Path,
    plain: bool,
    data_only: bool,
) -> anyhow::Result<()> {
    let mut cmd = command("pg_dump", db);
    cmd.arg("--schema")
        .arg(quote(&db.schema))
        .arg("--format")
        .arg(if plain { "plain" } else { "custom" })
        .arg("--file")
        .arg(output);
    if plain {
        cmd.arg("--column-inserts");
    }
    if data_only {
        cmd.arg("--data-only");
    }
    for table in &db.exclude_tables {
        cmd.arg("--exclude-table-data")
            .arg(format!("{}.{}", quote(&db.schema), quote(table)));
    }
    run(&mut cmd).await
}

pub async fn restore(db: &Database, dump: &Path, directory: &Path) -> anyhow::Result<()> {
    let sql = directory.join("restore.sql");
    run(Command::new("pg_restore")
        .arg("--no-owner")
        .arg("--no-acl")
        .arg("--file")
        .arg(&sql)
        .arg(dump)
        .kill_on_drop(true))
    .await?;
    let combined = directory.join("transaction.sql");
    use tokio::io::AsyncWriteExt;
    let mut output = tokio::fs::File::create(&combined).await?;
    output
        .write_all(format!("DROP SCHEMA IF EXISTS {} CASCADE;\n", quote(&db.schema)).as_bytes())
        .await?;
    tokio::io::copy(&mut tokio::fs::File::open(sql).await?, &mut output).await?;
    output.flush().await?;
    run(command("psql", db)
        .arg("--single-transaction")
        .arg("--variable=ON_ERROR_STOP=1")
        .arg("--file")
        .arg(combined))
    .await
}
