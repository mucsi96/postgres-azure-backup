# Stage 1: Maven distribution (plain Java, works on musl with the NIK JDK)
FROM docker.io/library/maven:3-eclipse-temurin-21 AS maven

# Stage 2: Build a GraalVM native executable with Liberica Native Image Kit.
# The musl-based (Alpaquita) variant produces a binary that runs on Alpine.
# NIK 25 (JDK 25) is required by the reachability-metadata schema used by the
# GraalVM native-maven-plugin version that Spring Boot manages.
FROM docker.io/bellsoft/liberica-native-image-kit-container:jdk-25-nik-25-musl AS build

COPY --from=maven /usr/share/maven /opt/maven
ENV MAVEN_HOME=/opt/maven
ENV PATH=/opt/maven/bin:$PATH

WORKDIR /workspace

# Copy POM and download dependencies (cached separately from source)
COPY pom.xml ./
RUN mvn dependency:go-offline -Pnative -B -Dorg.slf4j.simpleLogger.log.org.apache.maven.cli.transfer.Slf4jMavenTransferListener=warn

# Copy source code, run Spring AOT processing and compile the native image.
# SPRING_ACTUATOR_PORT must be resolvable during AOT processing (it has no
# default in application.yml so deployments fail fast when it is missing);
# any value different from the server port matches every real deployment,
# because the "management runs on a separate port" condition is fixed at
# build time.
COPY src ./src
RUN SPRING_ACTUATOR_PORT=8162 mvn native:compile -Pnative -DskipTests -B -Dorg.slf4j.simpleLogger.log.org.apache.maven.cli.transfer.Slf4jMavenTransferListener=warn

# Stage 3: Runtime image (no JVM needed, just the native binary + pg tools)
FROM docker.io/library/alpine:3.23

VOLUME /tmp

ARG SPRING_PROFILES_ACTIVE=prod

RUN apk add --no-cache postgresql18-client curl

COPY --from=build /workspace/target/postgres-azure-backup /app/postgres-azure-backup

# Set environment variables
ENV SPRING_PROFILES_ACTIVE=${SPRING_PROFILES_ACTIVE}

# Run the application. java.home is not set in a native image, but the Azure
# JDK HttpClient builder resolves ${java.home}/conf/net.properties from it, so
# it is pointed at a directory without that file.
ENTRYPOINT ["/app/postgres-azure-backup", "-Djdk.httpclient.allowRestrictedHeaders=content-length", "-Djava.home=/app"]
