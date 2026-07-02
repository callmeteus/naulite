FROM node:22-alpine

WORKDIR /app

RUN cat > server.mjs <<'EOF'
import http from "node:http";

const port = Number(process.env.PORT ?? 8080);

http
  .createServer((_request, response) => {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({
      status: "healthy",
      controlPlaneId: process.env.CONTROL_PLANE_ID ?? "cp-unknown",
      nodeCount: 0,
      serviceCount: 0
    }));
  })
  .listen(port, () => {
    process.stdout.write(`control-plane listening on ${port}\n`);
  });
EOF

EXPOSE 8080

CMD ["node", "server.mjs"]
