import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/postcss";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const destination = path.resolve(root, process.argv[2] ?? "outputs/GRA.html");
const entry = path.join(root, "scripts/standalone-entry.tsx");
const result = await build({
  configFile: false,
  root,
  logLevel: "warn",
  resolve: { alias: { "@": root } },
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  css: { postcss: { plugins: [tailwind()] } },
  plugins: [react()],
  build: {
    write: false,
    target: "es2022",
    minify: true,
    sourcemap: false,
    cssCodeSplit: false,
    assetsInlineLimit: 100000000,
    lib: { entry, name: "Blockland", formats: ["iife"] },
    rolldownOptions: {
      output: {
        codeSplitting: false,
        entryFileNames: "game.js",
        assetFileNames: "[name].[ext]",
      },
    },
  },
});
const outputs = (Array.isArray(result) ? result : [result]).flatMap((r) => r.output ?? []);
const chunks = outputs.filter((o) => o.type === "chunk");
if (chunks.length !== 1)
  throw Error("The standalone build must contain exactly one JavaScript chunk.");
let css = "";
for (const o of outputs) {
  if (o.type === "asset" && o.fileName.endsWith(".css")) css += o.source;
  else if (o.type === "asset") throw Error("Unembedded asset: " + o.fileName);
}
if (!css.length) throw Error("Missing styles.");
const js = chunks[0].code.replaceAll("</script", "<\\/script");
const html = `<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#14231e"><title>BLOCKLAND — wspólny świat</title><style>${css.replaceAll("</style", "<\\/style")}\n:root{--font-geist-sans:Arial;--font-geist-mono:Consolas}#root{width:100%;height:100%}</style></head><body><div id="root"></div><noscript>Włącz JavaScript, aby uruchomić grę.</noscript><script>${js}</script></body></html>`;
await fs.mkdir(path.dirname(destination), { recursive: true });
await fs.writeFile(destination, html, "utf8");
console.log(
  `Standalone HTML: ${destination}\nSize: ${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} MB. One script, inline styles, no external assets.`,
);
