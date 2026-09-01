package io.github.mucsi96.postgresbackuptool.configuration;

import org.springframework.aot.hint.RuntimeHints;
import org.springframework.aot.hint.RuntimeHintsRegistrar;
import org.springframework.boot.context.properties.bind.BindableRuntimeHintsRegistrar;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.ImportRuntimeHints;

import com.azure.spring.cloud.autoconfigure.implementation.keyvault.secrets.properties.AzureKeyVaultPropertySourceProperties;
import com.azure.spring.cloud.autoconfigure.implementation.keyvault.secrets.properties.AzureKeyVaultSecretProperties;

/**
 * Binding metadata for the properties behind the Key Vault property source.
 *
 * {@code KeyVaultEnvironmentPostProcessor} runs before there is an application
 * context and reads its own configuration with a plain {@code Binder} over
 * {@link AzureKeyVaultSecretProperties}. Nothing in the framework can infer
 * that, and the auto-configuration that would otherwise contribute the binding
 * metadata for the same type never matches here: it is conditional on
 * {@code spring.cloud.azure.keyvault[.secret].endpoint}, while this application
 * only configures an endpoint under {@code ...secret.property-sources[0]}.
 *
 * Without members, {@code JavaBeanBinder} binds nothing, and because an absent
 * binding is indistinguishable from an empty configuration the post-processor
 * quietly decides there are no property sources to add. The failure surfaces
 * only much later, and only in the prod profile, as every secret-backed
 * placeholder being unresolvable - the first of them
 * {@code ${storage-account-container-name}} while creating {@code backupService}.
 *
 * Only the prod profile reads secrets from Key Vault, so no test covers this.
 * To check the hints by hand, build the native image and start it with
 * {@code AZURE_KEYVAULT_ENDPOINT} pointing at an unreachable host: with the
 * metadata in place the post-processor binds the property source and fails
 * on the connection, which is the proof it did not skip. Silently reaching
 * the first unresolvable placeholder instead means the binding is gone
 * again. The AOT-on-JVM run cannot show this - reflection always works
 * there.
 */
@Configuration(proxyBeanMethods = false)
@ImportRuntimeHints(KeyVaultPropertySourceNativeHints.Registrar.class)
public class KeyVaultPropertySourceNativeHints {

  static class Registrar implements RuntimeHintsRegistrar {

    @Override
    public void registerHints(RuntimeHints hints, ClassLoader classLoader) {
      BindableRuntimeHintsRegistrar
          .forTypes(AzureKeyVaultSecretProperties.class,
              AzureKeyVaultPropertySourceProperties.class)
          .registerHints(hints, classLoader);
    }
  }
}
