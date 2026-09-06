package io.github.mucsi96.postgresbackuptool.service;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import io.github.mucsi96.postgresbackuptool.configuration.DatabaseConfiguration;
import io.github.mucsi96.postgresbackuptool.configuration.DatabaseConfigurationProvider;
import io.github.mucsi96.postgresbackuptool.model.DatabaseInfo;
import io.github.mucsi96.postgresbackuptool.model.Table;

@Service
public class DatabaseService {
    private final List<DatabaseConfiguration> databases;

    public DatabaseService(DatabaseConfigurationProvider configurationProvider) {
        this.databases = configurationProvider.getDatabaseConfigurations();
    }

    public List<DatabaseConfiguration> getDatabases() {
        return databases;
    }

    public List<String> getDatabaseNames() {
        return databases.stream().map(DatabaseConfiguration::getName).toList();
    }

    public DatabaseConfiguration getDatabaseConfiguration(String databaseName) {
        return databases.stream()
                .filter(db -> db.getName().equals(databaseName)).findFirst()
                .orElseThrow(() -> new RuntimeException("Database with name "
                        + databaseName + " not found in configuration"));
    }

    public DatabaseInfo getDatabaseInfo(String databaseName) {
        DatabaseConfiguration databaseConfiguration = getDatabaseConfiguration(
                databaseName);
        List<Map<String, Object>> result = databaseConfiguration
                .getJdbcTemplate().queryForList(
                        "SELECT table_name FROM information_schema.tables WHERE table_schema = ?",
                        databaseConfiguration.getSchema());

        List<Table> tables = result.stream()
                .filter(table -> !databaseConfiguration.getExcludeTables()
                        .contains((String) table.get("table_name")))
                .map(table -> {
                    String tableName = (String) table.get("table_name");
                    return Table.builder().name(tableName)
                            .rowCount(getTableRowCount(databaseName, tableName))
                            .build();
                }).toList();

        int totalRowCount = tables.stream().reduce(0,
                (acc, table) -> acc + table.getRowCount(), (a, b) -> a + b);

        return DatabaseInfo.builder().tables(tables)
                .totalRowCount(totalRowCount).build();

    }

    public record DatabaseSummary(int tablesCount, int totalRowCount) {
    }

    public DatabaseSummary getDatabaseSummary(String databaseName) {
        DatabaseConfiguration databaseConfiguration = getDatabaseConfiguration(
                databaseName);
        List<String> excludeTables = databaseConfiguration.getExcludeTables();
        String sql = "SELECT c.relname AS table_name, "
                + "GREATEST(c.reltuples, 0)::bigint AS row_count "
                + "FROM pg_class c "
                + "JOIN pg_namespace n ON n.oid = c.relnamespace "
                + "WHERE c.relkind = 'r' AND n.nspname = ?";
        List<Map<String, Object>> rows = databaseConfiguration.getJdbcTemplate()
                .queryForList(sql, databaseConfiguration.getSchema());
        int tablesCount = 0;
        long totalRowCount = 0L;
        for (Map<String, Object> row : rows) {
            String tableName = (String) row.get("table_name");
            if (excludeTables.contains(tableName)) {
                continue;
            }
            tablesCount++;
            Object rc = row.get("row_count");
            if (rc instanceof Number) {
                totalRowCount += ((Number) rc).longValue();
            }
        }
        return new DatabaseSummary(tablesCount,
                (int) Math.min(totalRowCount, Integer.MAX_VALUE));
    }

    public File createDump(String databaseName, String format)
            throws IOException, InterruptedException {
        return executePgDump(databaseName, format, false);
    }

    public File createDataOnlyDump(String databaseName)
            throws IOException, InterruptedException {
        return executePgDump(databaseName, "plain", true);
    }

    private File executePgDump(String databaseName, String format,
            boolean dataOnly) throws IOException, InterruptedException {
        DatabaseConfiguration databaseConfiguration = getDatabaseConfiguration(
                databaseName);
        String suffix = "plain".equals(format) ? ".sql" : ".pgdump";
        File outputFile = File.createTempFile("pgdump-", suffix);

        List<String> baseArgs = new ArrayList<>(List.of("pg_dump",
                "--dbname", databaseConfiguration.getConnectionString(),
                "--schema", databaseConfiguration.getSchema(), "--format",
                format, "--file", outputFile.getAbsolutePath()));

        if ("plain".equals(format)) {
            baseArgs.add("--column-inserts");
        }
        if (dataOnly) {
            baseArgs.add("--data-only");
        }

        List<String> commands = Stream.of(baseArgs,
                databaseConfiguration.getExcludeTables().stream()
                        .flatMap(table -> {
                            String fullTableName = databaseConfiguration
                                    .getSchema() + "." + table;
                            return List
                                    .of("--exclude-table-data", fullTableName)
                                    .stream();
                        }).toList())
                .flatMap(x -> x.stream()).filter(arg -> !arg.isEmpty())
                .toList();

        System.out.println("Creating dump: " + String.join(", ", commands));

        boolean success = false;
        try {
            int status = new ProcessBuilder(commands).inheritIO().start()
                    .waitFor();

            if (status != 0) {
                throw new RuntimeException(
                        "Unable to create dump. pg_dump failed");
            }

            if (!outputFile.exists()) {
                throw new RuntimeException("Unable to create dump. "
                        + outputFile + " was not created.");
            }

            System.out.println("Dump created");
            success = true;
            return outputFile;
        } finally {
            if (!success) {
                outputFile.delete();
            }
        }
    }

    public void restoreDump(String databaseName, File dumpFile)
            throws IOException, InterruptedException {
        DatabaseConfiguration databaseConfiguration = getDatabaseConfiguration(
                databaseName);
        String schema = databaseConfiguration.getSchema();
        String restoreOwner = getSchemaOwner(databaseConfiguration, schema);

        File pgRestoreSql = File.createTempFile("pg-restore-", ".sql");
        File combinedSql = File.createTempFile("restore-", ".sql");
        try {
            System.out.println("Converting dump to plain SQL");
            int pgrStatus = new ProcessBuilder("pg_restore", "--no-owner",
                    "--no-acl",
                    "--file=" + pgRestoreSql.getAbsolutePath(),
                    dumpFile.getAbsolutePath()).inheritIO().start().waitFor();
            if (pgrStatus != 0) {
                throw new RuntimeException(
                        "pg_restore failed with status " + pgrStatus);
            }

            // Single transaction: drop the existing schema, recreate it from
            // the dump. Concurrent readers keep seeing the old schema until
            // commit, then switch atomically to the new one. Any failure
            // rolls back, leaving the original schema untouched.
            try (OutputStream out = new FileOutputStream(combinedSql)) {
                String prelude = "DROP SCHEMA IF EXISTS "
                        + quoteIdentifier(schema) + " CASCADE;\n";
                out.write(prelude.getBytes(StandardCharsets.UTF_8));
                Files.copy(pgRestoreSql.toPath(), out);

                if (restoreOwner != null && !restoreOwner.isBlank()) {
                    out.write(createRestoreOwnerSql(schema, restoreOwner)
                            .getBytes(StandardCharsets.UTF_8));
                }
            }

            System.out.println("Applying restore in a single transaction");
            int psqlStatus = new ProcessBuilder("psql",
                    "--single-transaction", "--variable=ON_ERROR_STOP=1",
                    "--dbname", databaseConfiguration.getConnectionString(),
                    "--file", combinedSql.getAbsolutePath())
                            .inheritIO().start().waitFor();
            if (psqlStatus != 0) {
                throw new RuntimeException(
                        "psql restore failed with status " + psqlStatus);
            }

            System.out.println("Restore complete");
        } finally {
            pgRestoreSql.delete();
            combinedSql.delete();
        }
    }

    private String getSchemaOwner(
            DatabaseConfiguration databaseConfiguration, String schema) {
        List<String> owners = databaseConfiguration.getJdbcTemplate().query(
                "SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname = ?",
                (resultSet, rowNumber) -> resultSet.getString(1), schema);
        return owners.isEmpty() ? null : owners.get(0);
    }

    private String createRestoreOwnerSql(String schema, String restoreOwner) {
        String schemaLiteral = quoteLiteral(schema);
        String schemaIdentifier = quoteIdentifier(schema);
        String ownerLiteral = quoteLiteral(restoreOwner);
        String ownerIdentifier = quoteIdentifier(restoreOwner);

        return "\nDO $restore_owner$\n"
                + "DECLARE\n"
                + "    restored_object record;\n"
                + "BEGIN\n"
                + "    FOR restored_object IN\n"
                + "        SELECT c.relkind, format('%I.%I', n.nspname, c.relname) AS qualified_name\n"
                + "        FROM pg_class c\n"
                + "        JOIN pg_namespace n ON n.oid = c.relnamespace\n"
                + "        WHERE n.nspname = " + schemaLiteral + "\n"
                + "          AND c.relkind IN ('r', 'p', 'S', 'v', 'm', 'f')\n"
                + "        ORDER BY CASE WHEN c.relkind = 'S' THEN 1 ELSE 0 END\n"
                + "    LOOP\n"
                + "        EXECUTE format(\n"
                + "            CASE restored_object.relkind\n"
                + "                WHEN 'S' THEN 'ALTER SEQUENCE %s OWNER TO %I'\n"
                + "                WHEN 'v' THEN 'ALTER VIEW %s OWNER TO %I'\n"
                + "                WHEN 'm' THEN 'ALTER MATERIALIZED VIEW %s OWNER TO %I'\n"
                + "                WHEN 'f' THEN 'ALTER FOREIGN TABLE %s OWNER TO %I'\n"
                + "                ELSE 'ALTER TABLE %s OWNER TO %I'\n"
                + "            END,\n"
                + "            restored_object.qualified_name, " + ownerLiteral + ");\n"
                + "    END LOOP;\n"
                + "END\n"
                + "$restore_owner$;\n"
                + "ALTER SCHEMA " + schemaIdentifier + " OWNER TO "
                + ownerIdentifier + ";\n";
    }

    private String quoteIdentifier(String value) {
        return "\"" + value.replace("\"", "\"\"") + "\"";
    }

    private String quoteLiteral(String value) {
        return "'" + value.replace("'", "''") + "'";
    }

    private int getTableRowCount(String databaseName, String tableName) {
        DatabaseConfiguration databaseConfiguration = getDatabaseConfiguration(
                databaseName);
        String fullTableName = databaseConfiguration.getSchema() + "."
                + tableName;
        Integer count = databaseConfiguration.getJdbcTemplate().queryForObject(
                "SELECT COUNT(*) FROM " + fullTableName, Integer.class);

        return count != null ? count : 0;
    }
}
