FROM rust:1.89-slim-bullseye AS builder

WORKDIR /usr/src/app
COPY . .

RUN cargo build --release

FROM debian:bullseye-slim AS final

RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

COPY --from=builder /usr/src/app/target/release/api /usr/local/bin/api

EXPOSE 8000

CMD ["api"]