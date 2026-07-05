#!/bin/sh
set -e

# Docker Desktop bind-mounts docker.sock as root:root. When the agent runs as UID 0
# inside a user namespace, volumes first populated by naulite (1000) are not writable
# until ownership matches the runtime user.
if [ "$(id -u)" = "0" ] && [ -d /var/lib/naulite ]; then
    chown -R root:root /var/lib/naulite 2>/dev/null || true
    chmod -R u+rwX,g+rX /var/lib/naulite 2>/dev/null || true
fi

exec /usr/local/bin/naulite-agent "$@"
