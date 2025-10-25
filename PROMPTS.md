# Smart backup

Remove all Spring schedules. Please also stoip relying on dau of the month or day of the week. That's not important anymore.
I want to stop relying on long period schedules as my server will be normally off. I turn it on onl;y when I use it. I need by packubs to be more smart. Instead of multiple long period schedules I want a simple REST endpoint which would run the backup operation if needed. Also this logic should run on application startup. I want the logic to check what backups were done with each retentiuon period. Based on that decide if backup or cleanup is needed and with what retention period. The overall result and ammount of backups and cleanups and their retention periods should remain as before.
