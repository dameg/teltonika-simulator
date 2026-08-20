import { build } from "esbuild";

await build({
  entryPoints: ["src/dashboard/frontend/main.tsx"],
  bundle: true,
  minify: true,
  platform: "browser",
  format: "iife",
  loader: { ".png": "dataurl" },
  outfile: "dist/dashboard/frontend/dashboard-app.js",
});
