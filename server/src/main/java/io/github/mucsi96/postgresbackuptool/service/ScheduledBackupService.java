package io.github.mucsi96.postgresbackuptool.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;

/**
 * Service responsible for scheduling backup and cleanup tasks.
 * Uses BackupOrchestrationService to perform the actual operations.
 */
@Service
@RequiredArgsConstructor
public class ScheduledBackupService {
    private static final Logger logger = LoggerFactory.getLogger(ScheduledBackupService.class);

    private final BackupOrchestrationService backupOrchestrationService;

    /**
     * Daily backup - runs at 06:30 every day except Sunday and the 1st of the month
     * Retention period: 7 days
     */
    @Scheduled(cron = "${backup.schedule.daily.cron:0 30 6 2-31 * MON-SAT}")
    public void performDailyBackup() {
        logger.info("Starting scheduled daily backup with 7-day retention");
        try {
            backupOrchestrationService.performBackup(7);
            logger.info("Scheduled daily backup completed successfully");
        } catch (Exception e) {
            logger.error("Scheduled daily backup failed", e);
        }
    }

    /**
     * Weekly backup - runs at 06:30 every Sunday
     * Retention period: 30 days
     */
    @Scheduled(cron = "${backup.schedule.weekly.cron:0 30 6 * * SUN}")
    public void performWeeklyBackup() {
        logger.info("Starting scheduled weekly backup with 30-day retention");
        try {
            backupOrchestrationService.performBackup(30);
            logger.info("Scheduled weekly backup completed successfully");
        } catch (Exception e) {
            logger.error("Scheduled weekly backup failed", e);
        }
    }

    /**
     * Monthly backup - runs at 06:30 on the 1st of every month
     * Retention period: 356 days
     */
    @Scheduled(cron = "${backup.schedule.monthly.cron:0 30 6 1 * *}")
    public void performMonthlyBackup() {
        logger.info("Starting scheduled monthly backup with 356-day retention");
        try {
            backupOrchestrationService.performBackup(356);
            logger.info("Scheduled monthly backup completed successfully");
        } catch (Exception e) {
            logger.error("Scheduled monthly backup failed", e);
        }
    }

    /**
     * Daily cleanup - runs at 07:00 every day
     * Removes backups that have exceeded their retention period
     */
    @Scheduled(cron = "${backup.schedule.cleanup.cron:0 0 7 * * *}")
    public void performCleanup() {
        logger.info("Starting scheduled backup cleanup");
        try {
            backupOrchestrationService.performCleanup();
            logger.info("Scheduled backup cleanup completed successfully");
        } catch (Exception e) {
            logger.error("Scheduled backup cleanup failed", e);
        }
    }
}
