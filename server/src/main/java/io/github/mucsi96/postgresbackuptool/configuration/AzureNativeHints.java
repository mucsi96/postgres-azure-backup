package io.github.mucsi96.postgresbackuptool.configuration;

import org.springframework.aot.hint.MemberCategory;
import org.springframework.aot.hint.RuntimeHints;
import org.springframework.aot.hint.RuntimeHintsRegistrar;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.ImportRuntimeHints;

/**
 * {@code ExpandableStringEnum} constants are created by
 * {@code ExpandableStringEnum.fromString}, which instantiates the subclass
 * reflectively and returns {@code null} when it cannot. In a native image
 * without a hint that turns every constant of the class into {@code null}, and
 * the first use fails with a {@link NullPointerException} far from the cause.
 *
 * These two subclasses are missing from the reachability metadata azure-identity
 * ships (checked against 1.18.4); everything else the application touches is
 * covered by the Azure SDK's own metadata. Without the first one, building any
 * Azure client fails at startup.
 */
@Configuration(proxyBeanMethods = false)
@ImportRuntimeHints(AzureNativeHints.Registrar.class)
public class AzureNativeHints {

  static class Registrar implements RuntimeHintsRegistrar {

    private static final String[] EXPANDABLE_STRING_ENUMS = {
        "com.azure.identity.AzureIdentityEnvVars",
        "com.azure.identity.implementation.RegionalAuthority"
    };

    @Override
    public void registerHints(RuntimeHints hints, ClassLoader classLoader) {
      for (String type : EXPANDABLE_STRING_ENUMS) {
        hints.reflection().registerTypeIfPresent(classLoader, type,
            MemberCategory.INVOKE_DECLARED_CONSTRUCTORS);
      }
    }
  }
}
