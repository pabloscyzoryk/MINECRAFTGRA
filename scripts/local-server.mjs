import { readFile } from "node:fs/promises";
import server from "../api/game.js";
const handlers = server.listeners("request");
server.removeAllListeners("request");
server.on("request", async (req, res) => {
  if (req.url?.startsWith("/api/game")) {
    for (const handler of handlers) handler(req, res);
    return;
  }
  try {
    const body = await readFile(new URL("../public/index.html", import.meta.url));
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(body);
  } catch {
    res.writeHead(503);
    res.end("Run npm run build first.");
  }
});
server.listen(Number(process.env.PORT) || 3000, "127.0.0.1", () =>
  console.log("Local game: http://127.0.0.1:" + (process.env.PORT || 3000)),
);
