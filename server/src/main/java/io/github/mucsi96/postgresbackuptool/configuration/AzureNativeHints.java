package io.github.mucsi96.postgresbackuptool.configuration;

import com.azure.core.exception.HttpResponseException;
import com.azure.json.JsonSerializable;
import com.azure.xml.XmlSerializable;

import org.springframework.aot.hint.MemberCategory;
import org.springframework.aot.hint.RuntimeHints;
import org.springframework.aot.hint.RuntimeHintsRegistrar;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.ImportRuntimeHints;
import org.springframework.core.type.filter.AssignableTypeFilter;

/**
 * Reachability metadata for the parts of the Azure SDK that its own metadata
 * misses.
 *
 * {@code ExpandableStringEnum} constants are created by
 * {@code ExpandableStringEnum.fromString}, which instantiates the subclass
 * reflectively and returns {@code null} when it cannot. In a native image
 * without a hint that turns every constant of the class into {@code null}, and
 * the first use fails with a {@link NullPointerException} far from the cause.
 * Without the first of the two below, building any Azure client fails at
 * startup.
 *
 * The scan covers a second, quieter gap. azure-core picks how to read a
 * response body by asking the model class whether it declares the
 * {@code fromXml} / {@code fromJson} pair that azure-xml and azure-json
 * generate, and it asks with {@code Class.getDeclaredMethods()}. In a native
 * image that returns nothing for a class with no reachability metadata, so the
 * answer is silently "no" and azure-core falls back to Jackson - which for XML
 * means an {@code XmlMapper}, and jackson-dataformat-xml is not on the
 * classpath. The SDK ships metadata for most of its models but not all of them
 * (checked against azure-storage-blob 12.35.0, azure-security-keyvault-secrets
 * 4.11.1 and azure-identity 1.18.4, which between them leave out fourteen
 * classes, among them the blob error model and the exception that carries it,
 * so every storage error became a {@code NoClassDefFoundError}). Registering
 * every model rather than those fourteen keeps this from having to be
 * rediscovered on the next SDK upgrade.
 */
@Configuration(proxyBeanMethods = false)
@ImportRuntimeHints(AzureNativeHints.Registrar.class)
public class AzureNativeHints {

  static class Registrar implements RuntimeHintsRegistrar {

    private static final String AZURE_PACKAGE = "com.azure";

    private static final String[] EXPANDABLE_STRING_ENUMS = {
        "com.azure.identity.AzureIdentityEnvVars",
        "com.azure.identity.implementation.RegionalAuthority"
    };

    private static final Class<?>[] SERIALIZABLE_TYPES = {
        XmlSerializable.class,
        JsonSerializable.class,
        HttpResponseException.class
    };

    @Override
    public void registerHints(RuntimeHints hints, ClassLoader classLoader) {
      for (String type : EXPANDABLE_STRING_ENUMS) {
        hints.reflection().registerTypeIfPresent(classLoader, type,
            MemberCategory.INVOKE_DECLARED_CONSTRUCTORS);
      }

      ClassPathScanningCandidateComponentProvider scanner = new ClassPathScanningCandidateComponentProvider(
          false);
      for (Class<?> type : SERIALIZABLE_TYPES) {
        scanner.addIncludeFilter(new AssignableTypeFilter(type));
      }

      for (BeanDefinition definition : scanner.findCandidateComponents(AZURE_PACKAGE)) {
        hints.reflection().registerTypeIfPresent(classLoader, definition.getBeanClassName(),
            MemberCategory.INVOKE_DECLARED_CONSTRUCTORS, MemberCategory.INVOKE_DECLARED_METHODS);
      }
    }
  }
}
