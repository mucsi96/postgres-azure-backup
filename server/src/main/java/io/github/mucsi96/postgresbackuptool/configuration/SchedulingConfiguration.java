package io.github.mucsi96.postgresbackuptool.configuration;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

@Configuration
@EnableScheduling
@ConditionalOnProperty(name = "backup.schedule.enabled", havingValue = "true", matchIfMissing = true)
public class SchedulingConfiguration {
    // This class enables Spring's scheduled task execution capability
    // Scheduling can be disabled by setting backup.schedule.enabled=false
}
