FROM docker.io/library/rust:1.99.1-trixie AS build
WORKDIR /src
COPY Cargo.toml Cargo.lock rust-toolchain.toml ./
COPY src/ ./src/
RUN cargo build --release --locked

# PostgreSQL's maintained image supplies matching pg_dump, pg_restore and psql.
FROM docker.io/library/postgres:18.6-trixie
# Azure SDK HTTPS clients need the system trust store for Key Vault and identity.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && test -s /etc/ssl/certs/ca-certificates.crt \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /src/target/release/postgres-azure-backup-server /app/server
COPY config/ /app/config/
LABEL org.opencontainers.image.source="https://github.com/mucsi96/postgres-azure-backup"
ENV LOCO_ENV=production PORT=8080 BINDING=0.0.0.0
EXPOSE 8080
USER 65532:65532
ENTRYPOINT ["/app/server"]
CMD ["start", "--no-banner"]
