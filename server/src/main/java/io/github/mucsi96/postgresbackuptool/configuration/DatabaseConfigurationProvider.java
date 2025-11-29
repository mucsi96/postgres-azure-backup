package io.github.mucsi96.postgresbackuptool.configuration;

import java.util.List;

public interface DatabaseConfigurationProvider {
    List<DatabaseConfiguration> getDatabaseConfigurations();
}
