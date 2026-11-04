import { Alert, Button } from '@mucsi96/react-ui';

export function QueryError({ label, retry }: { label: string; retry: () => void }) {
  return <Alert tone="error">Unable to load {label}. <Button onPress={retry}>Try again</Button></Alert>;
}
