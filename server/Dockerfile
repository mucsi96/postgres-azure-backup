# Stage 1: Maven distribution, copied into the native build stage below.
# The GraalVM image ships a JDK but no build tool, and Maven is pure Java, so
# copying it in is cheaper and more predictable than installing it there.
FROM docker.io/library/maven:3-eclipse-temurin-25-alpine AS maven

# Stage 2: Compile the application into a native executable
FROM docker.io/bellsoft/liberica-native-image-kit-container:jdk-25-nik-25-musl AS build

COPY --from=maven /usr/share/maven /usr/share/maven
ENV PATH="/usr/share/maven/bin:${PATH}"

# The Spring profile is resolved during AOT processing and baked into the
# executable, so an image serves exactly one profile. Build one image per
# profile: `test` for the e2e pod, `prod` for the published image.
ARG SPRING_PROFILE=prod

WORKDIR /workspace

# Copy POM and download dependencies (cached separately from source)
COPY pom.xml ./
RUN mvn dependency:go-offline -B -Dorg.slf4j.simpleLogger.log.org.apache.maven.cli.transfer.Slf4jMavenTransferListener=warn

# Copy source code and compile the native executable
COPY native-image.security ./
COPY src ./src
RUN mvn -Pnative native:compile -DskipTests -B \
    -Dapp.profile=${SPRING_PROFILE} \
    -Dorg.slf4j.simpleLogger.log.org.apache.maven.cli.transfer.Slf4jMavenTransferListener=warn

# Stage 3: Runtime image
FROM docker.io/library/alpine:3.23

VOLUME /tmp

# pg_dump / pg_restore / psql are invoked as subprocesses; curl is used for
# health checks. The executable is fully static, so no JRE and no libc here.
RUN apk add --no-cache postgresql18-client curl

COPY --from=build /workspace/target/postgres-azure-backup /app/postgres-azure-backup

# There is no JDK in this image, so java.home is unset, and the Azure SDK's JDK
# HTTP client builder dereferences it to read <java.home>/conf/net.properties.
# Point it at an empty file: the JDK ships that property empty by default too,
# and the header allow-list below is what actually matters.
RUN mkdir -p /app/conf && : > /app/conf/net.properties

# MaximumHeapSizePercent (default 80) is trimmed to leave the container room for
# the pg_dump / pg_restore / psql child processes. The Azure SDK sets
# Content-Length explicitly on the JDK HTTP client, which the client rejects
# unless the header is allow-listed.
ENTRYPOINT ["/app/postgres-azure-backup", \
    "-XX:MaximumHeapSizePercent=75", \
    "-Djava.home=/app", \
    "-Djdk.httpclient.allowRestrictedHeaders=content-length"]
