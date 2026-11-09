package io.github.mucsi96.postgresbackuptool.configuration;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;

import com.azure.spring.cloud.autoconfigure.implementation.context.properties.AzureGlobalProperties;

/**
 * Spring Cloud Azure registers its {@code springCloudAzureGlobalProperties} bean
 * from an {@code ImportBeanDefinitionRegistrar} that binds the properties in a
 * lambda instance supplier. Ahead-of-time processing cannot turn such a supplier
 * into generated code, so it drops the bean, and the AOT-processed application
 * fails to start with "required a bean of type AzureGlobalProperties that could
 * not be found".
 *
 * This declares the same properties as a plain configuration-properties bean,
 * which AOT can generate, under its own name: the registrar reserves
 * {@code springCloudAzureGlobalProperties} before AOT processing reaches this
 * class, and a bean method losing that race is skipped silently. Everything
 * injects {@link AzureGlobalProperties} by type, so with AOT this is the only
 * candidate, and without it {@link Primary} picks it over the registrar's.
 */
@Configuration(proxyBeanMethods = false)
public class AzureGlobalPropertiesConfiguration {

  @Bean
  @Primary
  @ConfigurationProperties(prefix = AzureGlobalProperties.PREFIX)
  AzureGlobalProperties appSpringCloudAzureGlobalProperties() {
    return new AzureGlobalProperties();
  }
}
