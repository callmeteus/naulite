FROM node:22-alpine

WORKDIR /app

RUN cat > server.mjs <<'EOF'
import http from "node:http";

const port = Number(process.env.PORT ?? 8080);
const nodeId = process.env.NODE_ID ?? "worker-unknown";

http
  .createServer((request, response) => {
    if (request.url === "/health") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({
        status: "ok",
        nodeId,
        capability: process.env.CAPABILITY ?? "worker"
      }));
      return;
    }

    response.writeHead(404);
    response.end("not found");
  })
  .listen(port, () => {
    process.stdout.write(`worker ${nodeId} listening on ${port}\n`);
  });
EOF

EXPOSE 8080

CMD ["node", "server.mjs"]
