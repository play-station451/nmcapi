import app from "./app.js";

const port = Number.parseInt(process.env.PORT ?? "3000", 10) || 3000;

const server = app.listen(port, () => {
  console.log(`Minecraft profile API listening on port ${port}`);
});

server.on("error", (error) => {
  console.error("Server failed to start:", error);
  process.exitCode = 1;
});

function shutdown(signal) {
  console.log(`${signal} received, shutting down`);

  server.close((error) => {
    if (error) {
      console.error("Server shutdown failed:", error);
      process.exitCode = 1;
    }
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
