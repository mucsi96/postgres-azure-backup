import { Link, useMatch, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Badge, Button, Menu, MenuItem, MenuPopover, MenuTrigger } from '@mucsi96/react-ui';
import { databasesQuery, lastBackupQuery, profileQuery } from './api';
import { olderThanOneDay, relativeTime } from './format';
import { QueryError } from './QueryError';
import styles from './Header.module.css';

export function Header() {
  const name = useMatch('/database/:name')?.params.name;
  const navigate = useNavigate();
  const databases = useQuery({ ...databasesQuery, enabled: Boolean(name) });
  const lastBackup = useQuery(lastBackupQuery(name ?? ''));
  const profile = useQuery(profileQuery);
  const fullName = (profile.data?.additionalClaims?.name ?? profile.data?.email)?.trim();
  const initials = fullName?.split(/\s+/).map(part => part[0]).join('').toUpperCase();

  return <header className={styles.header}>
    <nav aria-label="Main navigation">
      <Link to="/">Postgres Backup Tool</Link>
      <div className={styles.right}>
        {name && <>
          <MenuTrigger>
            <Button variant="text">{name}</Button>
            <MenuPopover><Menu aria-label="Databases">
              {databases.data?.map(database => <MenuItem key={database.name} onAction={() => void navigate(`/database/${encodeURIComponent(database.name)}`)}>{database.name}</MenuItem>)}
            </Menu></MenuPopover>
          </MenuTrigger>
          {databases.isError && <QueryError label="databases" retry={() => void databases.refetch()} />}
          {lastBackup.isError ? <QueryError label="last backup time" retry={() => void lastBackup.refetch()} /> :
            <p className={styles.lastBackup} data-testid="last-backup">Last backup{' '}
              <Badge tone={lastBackup.data ? (olderThanOneDay(lastBackup.data) ? 'error' : 'success') : 'neutral'}>
                {lastBackup.isPending ? 'Loading…' : relativeTime(lastBackup.data ?? null)}
              </Badge>
            </p>}
        </>}
        {profile.isError ? <QueryError label="profile" retry={() => void profile.refetch()} /> : fullName &&
          <MenuTrigger>
            <Button variant="avatar" aria-label={initials}>{initials}</Button>
            <MenuPopover><Menu aria-label="Profile"><MenuItem isDisabled>{fullName}</MenuItem></Menu></MenuPopover>
          </MenuTrigger>}
      </div>
    </nav>
  </header>;
}
