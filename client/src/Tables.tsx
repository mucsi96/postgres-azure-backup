import { useQuery } from '@tanstack/react-query';
import { Badge, LoadingArea, Button, Heading } from '@mucsi96/react-ui';
import { createBackup, databasePath, download, tablesQuery } from './api';
import { QueryError } from './QueryError';
import { useBackupAction } from './useBackupAction';
import styles from './Tables.module.css';
import table from './Table.module.css';

export function Tables({ name, processing }: { name: string; processing: boolean }) {
  const tables = useQuery(tablesQuery(name));
  const backup = useBackupAction(() => createBackup(name), 'Backup created');
  const exportSql = useBackupAction(() => download(`${databasePath(name)}/export-sql`));
  if (tables.isPending) return <LoadingArea label="Loading tables" />;
  if (tables.isError) return <QueryError label="tables" retry={() => void tables.refetch()} />;

  return <section className={styles.tables} aria-label="Database tables">
    <Button isDisabled={processing} onPress={() => backup.mutate(undefined)}>Backup</Button>
    <Button isDisabled={processing} onPress={() => exportSql.mutate(undefined)}>Export SQL</Button>
    <Heading level={2}>Records <Badge>{tables.data.totalRowCount}</Badge></Heading>
    <Heading level={2}>Files <Badge>{tables.data.fileCount}</Badge></Heading>
    <div className={styles.list}>
      <Heading level={2}>Tables <Badge>{tables.data.tables.length}</Badge></Heading>
      <table className={table.table} aria-label="Tables">
        <thead><tr><th>Name</th><th>Records</th></tr></thead>
        <tbody>{tables.data.tables.map(row => <tr key={row.name}><td>{row.name}</td><td>{row.rowCount}</td></tr>)}</tbody>
      </table>
      {!tables.data.tables.length && <p>No tables found.</p>}
    </div>
  </section>;
}
