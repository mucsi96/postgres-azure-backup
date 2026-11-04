import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Badge, BarLoader, Button, Heading } from '@mucsi96/react-ui';
import { backupsQuery, databasePath, download, restoreBackup } from './api';
import { relativeTime, retention, size } from './format';
import { QueryError } from './QueryError';
import { useBackupAction } from './useBackupAction';
import styles from './Backups.module.css';
import table from './Table.module.css';

export function Backups({ name, processing }: { name: string; processing: boolean }) {
  const backups = useQuery(backupsQuery(name));
  const [selected, setSelected] = useState<string>();
  const restore = useBackupAction((key: string) => restoreBackup(name, key), 'Backup restored');
  const downloadBackup = useBackupAction(({ key, type }: { key: string; type: string }) =>
    download(`${databasePath(name)}/backup/${encodeURIComponent(key)}/${type}`));
  if (backups.isPending) return <BarLoader label="Loading backups" />;
  if (backups.isError) return <QueryError label="backups" retry={() => void backups.refetch()} />;

  return <section className={styles.backups} aria-label="Backups">
    <Heading level={2}>Backups <Badge>{backups.data.length}</Badge></Heading>
    <table id="backups" className={table.table} aria-label="Backups">
      <thead><tr><th></th><th>Date</th><th>Records</th><th>Size</th><th>Files</th><th>Files Size</th><th>Retention</th><th></th></tr></thead>
      <tbody>{backups.data.map(backup => {
        const disabled = processing || backup.name !== selected;
        return <tr key={backup.name} aria-selected={backup.name === selected} onClick={() => setSelected(backup.name)}>
          <td><input type="radio" name="backup" aria-label={`Select backup ${backup.name}`} checked={backup.name === selected} onChange={() => setSelected(backup.name)} /></td>
          <td>{relativeTime(backup.lastModified)}</td><td>{backup.totalRowCount}</td><td>{size(backup.size)}</td>
          <td>{backup.fileCount}</td><td>{size(backup.filesTotalSize)}</td><td>{retention(backup.retentionPeriod)}</td>
          <td><div className={styles.actions}>
            {(['archive', 'pgdump', ...(backup.hasPlainDump ? ['sql'] : [])]).map(type =>
              <Button key={type} variant="icon" className={disabled ? styles.hidden : undefined} isDisabled={disabled}
                aria-label={`Download ${type === 'sql' ? 'plain SQL' : type}`}
                onPress={() => downloadBackup.mutate({ key: backup.name, type })}>
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d={type === 'archive' ? 'M3 7h7l2 2h9v11H3z M3 7V4h7l2 3' : type === 'sql' ? 'M6 3h8l4 4v14H6z M9 12h6 M9 16h6' : 'M4 4h16v5H4z M6 9v12h12V9 M10 13h4'} />
                </svg>
              </Button>)}
            <Button tone="warn" isDisabled={disabled} onPress={() => restore.mutate(backup.name)}>Restore</Button>
          </div></td>
        </tr>;
      })}</tbody>
    </table>
    {!backups.data.length && <p>No backups yet.</p>}
  </section>;
}
