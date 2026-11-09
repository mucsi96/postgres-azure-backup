package io.github.mucsi96.postgresbackuptool.scheduler;

import io.github.mucsi96.postgresbackuptool.service.SmartBackupService;
import io.github.mucsi96.postgresbackuptool.service.SmartBackupService.SmartBackupResult;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Scheduler component that automatically triggers smart backups at regular intervals.
 * Runs every 24 hours to ensure regular backup coverage.
 */
@Component
@Profile("!test")
@RequiredArgsConstructor
@Slf4j
public class BackupScheduler {

    private final SmartBackupService smartBackupService;

    /**
     * Scheduled task that runs immediately on application startup and then every 24 hours (86400000 milliseconds).
     * Uses fixedDelay to ensure 24 hours between the completion of one backup and the start of the next.
     */
    @Scheduled(fixedDelay = 86400000)
    public void performScheduledBackup() {
        log.info("Starting scheduled smart backup (24-hour interval)");

        try {
            SmartBackupResult result = smartBackupService.performSmartBackup();

            if (!result.hasError()) {
                log.info("Scheduled smart backup completed successfully");

                if (!result.getBackupsPerformed().isEmpty()) {
                    log.info("Backups performed during scheduled run:");
                    result.getBackupsPerformed().forEach(backup ->
                        log.info("  - Database: {}, Retention: {} days",
                            backup.getDatabase(),
                            backup.getRetentionPeriod())
                    );
                }

                if (result.isCleanupPerformed()) {
                    log.info("Cleanup of expired backups was also performed");
                }
            } else {
                log.error("Scheduled smart backup completed with error: {}", result.getError());
            }
        } catch (Exception e) {
            log.error("Failed to execute scheduled smart backup", e);
        }
    }
}