import { useParams } from 'react-router';
import { useIsMutating } from '@tanstack/react-query';
import { Tables } from './Tables';
import { Backups } from './Backups';
import styles from './Database.module.css';

export function Database() {
  const { name } = useParams();
  const processing = useIsMutating({ mutationKey: ['backup-action'] }) > 0;
  if (!name) return null;
  return <div className={styles.database} key={name}>
    <Tables name={name} processing={processing} />
    <Backups name={name} processing={processing} />
  </div>;
}
