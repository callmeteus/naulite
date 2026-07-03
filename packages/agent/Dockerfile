FROM debian:bookworm-slim AS zig-base

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates xz-utils \
    && rm -rf /var/lib/apt/lists/*

# Must match infra/zig-toolchain.env and .github/workflows/ci.yml env.ZIG_VERSION
# URL format: https://ziglang.org/builds/zig-x86_64-linux-{version}.tar.xz (see download/index.json master)
ARG ZIG_VERSION=0.17.0-dev.1158+1d1193aa7
ARG ZIG_URL=https://ziglang.org/builds/zig-x86_64-linux-${ZIG_VERSION}.tar.xz

RUN curl -fsSL "${ZIG_URL}" -o /tmp/zig.tar.xz \
    && tar -xJf /tmp/zig.tar.xz -C /opt \
    && ln -s /opt/zig-x86_64-linux-${ZIG_VERSION} /opt/zig \
    && rm /tmp/zig.tar.xz

ENV PATH="/opt/zig:${PATH}"

FROM zig-base AS builder

WORKDIR /build

COPY packages/agent/build.zig packages/agent/build.zig
COPY packages/agent/build.zig.zon packages/agent/build.zig.zon
COPY packages/agent/src packages/agent/src

WORKDIR /build/packages/agent

RUN zig build -Doptimize=ReleaseSafe

FROM debian:bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates docker.io \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /build/packages/agent/zig-out/bin/platform-agent /usr/local/bin/platform-agent

EXPOSE 9470

CMD ["platform-agent"]
