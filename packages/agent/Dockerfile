FROM debian:bookworm-slim AS zig-base

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates xz-utils \
    && rm -rf /var/lib/apt/lists/*

# Must match infra/zig-toolchain.env and .github/workflows/ci.yml env.ZIG_VERSION
# URL format: https://ziglang.org/download/{version}/zig-x86_64-linux-{version}.tar.xz (see download/index.json master)
ARG ZIG_VERSION=0.16.0
ARG ZIG_URL=https://ziglang.org/download/${ZIG_VERSION}/zig-x86_64-linux-${ZIG_VERSION}.tar.xz

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

# Pinned NetBird CLI - confirmed at https://github.com/netbirdio/netbird/releases/tag/v0.35.2
ARG NETBIRD_VERSION=0.35.2
ARG DOCKER_GID=999

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        gnupg \
        iptables \
        wireguard-tools \
    && install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://download.docker.com/linux/debian/gpg \
        | gpg --dearmor -o /etc/apt/keyrings/docker.gpg \
    && echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian bookworm stable" \
        > /etc/apt/sources.list.d/docker.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends docker-ce-cli \
    && curl -fsSL "https://github.com/netbirdio/netbird/releases/download/v${NETBIRD_VERSION}/netbird_${NETBIRD_VERSION}_linux_amd64.deb" \
        -o /tmp/netbird.deb \
    && apt-get install -y /tmp/netbird.deb \
    && rm -f /tmp/netbird.deb \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid "${DOCKER_GID}" docker \
    && groupadd --system --gid 1000 platform \
    && useradd --system --uid 1000 --gid platform --home-dir /var/lib/platform --shell /usr/sbin/nologin platform \
    && usermod -aG docker platform \
    && mkdir -p /var/lib/platform \
    && chown -R platform:platform /var/lib/platform

COPY --from=builder /build/packages/agent/zig-out/bin/platform-agent /usr/local/bin/platform-agent

EXPOSE 9470

USER platform

CMD ["platform-agent"]
