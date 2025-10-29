package io.github.mucsi96.postgresbackuptool.startup;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

import io.github.mucsi96.postgresbackuptool.service.SmartBackupService;
import io.github.mucsi96.postgresbackuptool.service.SmartBackupService.SmartBackupResult;
import lombok.RequiredArgsConstructor;

/**
 * Startup runner that always executes smart backup analysis and operations
 * when the application starts. This ensures backups are automatically maintained
 * according to the defined retention periods (daily, weekly, monthly).
 */
@Component
@RequiredArgsConstructor
public class SmartBackupStartupRunner implements ApplicationRunner {
    private static final Logger logger = LoggerFactory.getLogger(SmartBackupStartupRunner.class);

    private final SmartBackupService smartBackupService;

    @Override
    public void run(ApplicationArguments args) throws Exception {
        logger.info("Executing smart backup on application startup");

        try {
            SmartBackupResult result = smartBackupService.performSmartBackup();

            if (result.hasError()) {
                logger.error("Smart backup startup completed with errors: {}", result.getError());
            } else {
                logger.info("Smart backup startup completed successfully");

                if (!result.getBackupsPerformed().isEmpty()) {
                    logger.info("Backups performed during startup:");
                    result.getBackupsPerformed().forEach(op ->
                        logger.info("  - Database: {}, Retention: {} days",
                            op.getDatabase(), op.getRetentionPeriod())
                    );
                } else {
                    logger.info("No backups were needed during startup");
                }

                if (result.isCleanupPerformed()) {
                    logger.info("Cleanup of expired backups was performed");
                }
            }
        } catch (Exception e) {
            logger.error("Failed to execute smart backup on startup", e);
            // Don't throw the exception to prevent application startup failure
            // The backup can be triggered manually via the REST endpoint
        }
    }
}
