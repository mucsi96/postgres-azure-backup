package io.github.mucsi96.postgresbackuptool.configuration;

import java.util.Collection;
import java.util.Optional;
import java.util.stream.Stream;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.oauth2.server.resource.authentication.JwtGrantedAuthoritiesConverter;
import org.springframework.security.web.SecurityFilterChain;

@Configuration
@EnableMethodSecurity(prePostEnabled = true)
public class SecurityConfiguration {

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http)
            throws Exception {

        http.oauth2ResourceServer(oauth2 -> oauth2
                .jwt(jwt -> jwt.jwtAuthenticationConverter(jwtAuthenticationConverter())));

        http.authorizeHttpRequests(requests -> requests
                .requestMatchers("/environment").permitAll()
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
