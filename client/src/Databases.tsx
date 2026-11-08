import { Link, useNavigate } from 'react-router';
import { useIsMutating, useQuery } from '@tanstack/react-query';
import { Badge, LoadingArea, Heading, MenuItem, SplitButton } from '@mucsi96/react-ui';
import { createBackup, databasesQuery, smartBackup } from './api';
import { olderThanOneDay, relativeTime } from './format';
import { QueryError } from './QueryError';
import { useBackupAction } from './useBackupAction';
import styles from './Databases.module.css';
import table from './Table.module.css';

export function Databases() {
  const databases = useQuery(databasesQuery);
  const navigate = useNavigate();
  const backup = useBackupAction(() => createBackup(), 'Backup completed');
  const smart = useBackupAction(smartBackup, 'Smart backup completed');
  const processing = useIsMutating({ mutationKey: ['backup-action'] }) > 0;
  if (databases.isPending) return <LoadingArea label="Loading databases" fill />;
  if (databases.isError) return <QueryError label="databases" retry={() => void databases.refetch()} />;

  return <section className={styles.databases} aria-label="Databases">
    <Heading level={2}>Databases <Badge>{databases.data.length}</Badge></Heading>
    <SplitButton label="Backup" menuLabel="More backup options" isDisabled={processing} onPress={() => backup.mutate(undefined)}>
      <MenuItem onAction={() => smart.mutate(undefined)}>Backup if needed</MenuItem>
    </SplitButton>
    <table className={table.table} aria-label="Databases">
      <thead><tr><th></th><th>Name</th><th>Tables</th><th>Records</th><th>Files</th><th>Backups</th><th>Last backup</th></tr></thead>
      <tbody>{databases.data.map(database => <tr key={database.name} onClick={() => void navigate(`/database/${encodeURIComponent(database.name)}`)}>
        <td></td>
        <td><Link to={`/database/${encodeURIComponent(database.name)}`} onClick={event => event.stopPropagation()}>{database.name}</Link></td>
        <td>{database.tablesCount}</td><td>{database.totalRowCount}</td><td>{database.fileCount}</td><td>{database.backupsCount}</td>
        <td className={olderThanOneDay(database.lastBackupTime) ? table.old : table.recent}>{relativeTime(database.lastBackupTime)}</td>
      </tr>)}</tbody>
    </table>
    {!databases.data.length && <p>No databases configured.</p>}
  </section>;
}
