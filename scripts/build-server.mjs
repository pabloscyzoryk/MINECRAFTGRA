import { build } from "esbuild";
await build({
  entryPoints: ["server/entry.ts"],
  outfile: "api/game.js",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  packages: "external",
  sourcemap: false,
});
console.log("Vercel WebSocket server: api/game.js");
