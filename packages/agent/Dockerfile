FROM debian:bookworm-slim AS zig-base

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates xz-utils \
    && rm -rf /var/lib/apt/lists/*

ARG ZIG_URL=https://ziglang.org/download/0.14.0/zig-linux-x86_64-0.14.0.tar.xz

RUN curl -fsSL "${ZIG_URL}" -o /tmp/zig.tar.xz \
    && tar -xJf /tmp/zig.tar.xz -C /opt \
    && ln -s /opt/zig-linux-x86_64-0.14.0 /opt/zig \
    && rm /tmp/zig.tar.xz

ENV PATH="/opt/zig:${PATH}"

FROM zig-base AS builder

WORKDIR /build

COPY packages/agent/build.zig packages/agent/build.zig
COPY packages/agent/build.zig.zon packages/agent/build.zig.zon
COPY packages/agent/src packages/agent/src

WORKDIR /build/packages/agent

# Agent sources target Zig 0.17 APIs; install matching toolchain for release images.
ARG ZIG_DEV_URL=https://ziglang.org/builds/zig-linux-x86_64-0.17.0-dev.tar.xz

RUN curl -fsSL "${ZIG_DEV_URL}" -o /tmp/zig-dev.tar.xz \
    && rm -rf /opt/zig \
    && tar -xJf /tmp/zig-dev.tar.xz -C /opt \
    && ln -s /opt/zig-linux-x86_64-0.17.0-dev /opt/zig \
    && rm /tmp/zig-dev.tar.xz \
    && zig build -Doptimize=ReleaseSafe

FROM alpine:3.20

RUN apk add --no-cache ca-certificates

COPY --from=builder /build/packages/agent/zig-out/bin/platform-agent /usr/local/bin/platform-agent

EXPOSE 9470

CMD ["platform-agent"]
