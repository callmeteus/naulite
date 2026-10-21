FROM node:22-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        awscli \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /var/lib/naulite

COPY packages/agent/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN sed -i 's/\r$//' /usr/local/bin/docker-entrypoint.sh \
    && chmod +x /usr/local/bin/docker-entrypoint.sh

# Host-built Zig agent binary is bind-mounted at runtime (see ec2-lab-agent.compose.yml).
RUN install -m 0755 /bin/true /usr/local/bin/naulite-agent

ENV PATH="/usr/local/bin:/usr/local/sbin:/usr/sbin:/usr/bin:/sbin:/bin"
ENV AGENT_PORT=9470

EXPOSE 9470

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
