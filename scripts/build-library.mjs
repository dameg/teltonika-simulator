import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { build } from "esbuild";

const rootPackage = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const outputDirectory = new URL("../dist/package/", import.meta.url);

rmSync(outputDirectory, { recursive: true, force: true });
mkdirSync(outputDirectory, { recursive: true });

const buildEntry = async (entryPoint, outputName) => {
  await build({
    entryPoints: [entryPoint],
    bundle: true,
    external: ["node:*"],
    format: "esm",
    platform: "node",
    target: "node20",
    outfile: new URL(`./${outputName}.js`, outputDirectory).pathname,
    sourcemap: true,
  });

  await build({
    entryPoints: [entryPoint],
    bundle: true,
    external: ["node:*"],
    format: "cjs",
    platform: "node",
    target: "node20",
    outfile: new URL(`./${outputName}.cjs`, outputDirectory).pathname,
    sourcemap: true,
  });
};

await buildEntry("src/library/index.ts", "index");
await buildEntry("src/library/core.ts", "core");

execFileSync(process.execPath, ["node_modules/typescript/bin/tsc", "-p", "tsconfig.library.json"], {
  stdio: "inherit",
});

const packageManifest = {
  name: rootPackage.name,
  version: rootPackage.version,
  description: "Teltonika GPS device simulator for Node.js integration tests",
  type: "module",
  main: "./index.cjs",
  types: "./types/library/index.d.ts",
  exports: {
    ".": {
      types: "./types/library/index.d.ts",
      import: "./index.js",
      require: "./index.cjs",
      default: "./index.js",
    },
    "./core": {
      types: "./types/library/core.d.ts",
      import: "./core.js",
      require: "./core.cjs",
      default: "./core.js",
    },
  },
  files: ["index.js", "index.cjs", "core.js", "core.cjs", "types", "*.map", "README.md"],
  engines: { node: ">=20" },
  repository: rootPackage.repository,
  license: rootPackage.license,
};

copyFileSync(new URL("../README.md", import.meta.url), new URL("./README.md", outputDirectory));
writeFileSync(
  new URL("./package.json", outputDirectory),
  `${JSON.stringify(packageManifest, null, 2)}\n`,
  "utf8",
);
