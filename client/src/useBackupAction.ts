import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNotifications } from '@mucsi96/react-ui';

// A mutation owns its pending/error state; refresh every affected view even when
// a multi-database operation only partially succeeds.
export function useBackupAction<T>(action: (input: T) => Promise<void>, message?: string) {
  const client = useQueryClient();
  const notifications = useNotifications();
  return useMutation({
    mutationKey: ['backup-action'],
    mutationFn: action,
    onSuccess: () => { if (message) notifications.success(message); },
    onError: (error) => notifications.error(`An error occurred. ${error.message}`),
    onSettled: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['databases'] }),
        client.invalidateQueries({ queryKey: ['database'] }),
      ]);
    },
  });
}
