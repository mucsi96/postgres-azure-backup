package io.github.mucsi96.postgresbackuptool.configuration;

import java.util.Collection;
import java.util.Optional;
import java.util.stream.Stream;
import jakarta.servlet.DispatcherType;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.ObjectPostProcessor;

import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.oauth2.server.resource.authentication.JwtGrantedAuthoritiesConverter;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfFilter;

@Configuration
@EnableMethodSecurity(prePostEnabled = true)
public class SecurityConfiguration {

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http)
            throws Exception {

        var csrfTokens = CookieCsrfTokenRepository.withHttpOnlyFalse();
        csrfTokens.setCookieName("__Host-XSRF-TOKEN");
        csrfTokens.setCookieCustomizer(cookie -> cookie.path("/").secure(true).sameSite("Lax"));
        http.csrf(csrf -> {
            csrf.spa().csrfTokenRepository(csrfTokens);
            csrf.addObjectPostProcessor(new ObjectPostProcessor<CsrfFilter>() {
                @Override
                public <O extends CsrfFilter> O postProcess(O filter) {
                    // The gateway derives bearer credentials from a browser session.
                    filter.setRequireCsrfProtectionMatcher(CsrfFilter.DEFAULT_CSRF_MATCHER);
                    return filter;
                }
            });
        });
        http.oauth2ResourceServer(oauth2 -> oauth2
                .jwt(jwt -> jwt.jwtAuthenticationConverter(jwtAuthenticationConverter())));

        http.authorizeHttpRequests(requests -> requests
                .dispatcherTypeMatchers(DispatcherType.ERROR).permitAll()
                .requestMatchers("/actuator/**").permitAll()
                .requestMatchers("/download/**").permitAll()
                .anyRequest().hasAuthority("SCOPE_api-access"));

        return http.build();
    }

    private JwtAuthenticationConverter jwtAuthenticationConverter() {
        JwtGrantedAuthoritiesConverter scopeConverter = new JwtGrantedAuthoritiesConverter();

        JwtAuthenticationConverter converter = new JwtAuthenticationConverter();
        converter.setJwtGrantedAuthoritiesConverter(jwt -> Stream.concat(
                scopeConverter.convert(jwt).stream(),
                Optional.ofNullable(jwt.getClaimAsStringList("roles"))
                        .stream()
                        .flatMap(Collection::stream)
                        .map(role -> new SimpleGrantedAuthority("APPROLE_" + role)))
                .toList());
        return converter;
    }
}
