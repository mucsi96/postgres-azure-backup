# Stage 1: Build server with Maven
FROM maven:3-eclipse-temurin-21 AS build

WORKDIR /workspace

# Copy POM and source code
COPY pom.xml ./
COPY src ./src

# Build the application
RUN mvn package -DskipTests -B -Dorg.slf4j.simpleLogger.log.org.apache.maven.cli.transfer.Slf4jMavenTransferListener=warn

# Extract dependencies for layer caching
RUN mkdir -p target/dependency && (cd target/dependency; jar -xf ../*.jar)

# Stage 2: Runtime image
FROM bellsoft/liberica-openjre-alpine-musl:25

VOLUME /tmp

ARG DEPENDENCY=/workspace/target/dependency
ARG SPRING_PROFILES_ACTIVE=prod

RUN apk add postgresql17-client curl

# Copy application layers
COPY --from=build ${DEPENDENCY}/BOOT-INF/lib /app/lib
COPY --from=build ${DEPENDENCY}/META-INF /app/META-INF
COPY --from=build ${DEPENDENCY}/BOOT-INF/classes /app

# Set environment variables
ENV SPRING_PROFILES_ACTIVE=${SPRING_PROFILES_ACTIVE}

# Run the application
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75.0", "-Djdk.httpclient.allowRestrictedHeaders=content-length", "-cp", "app:app/lib/*", "io.github.mucsi96.postgresbackuptool.App"]
