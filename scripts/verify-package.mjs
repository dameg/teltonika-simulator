import { createRequire } from "node:module";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const packageDirectory = resolve("dist/package");
const manifest = JSON.parse(readFileSync(join(packageDirectory, "package.json"), "utf8"));
const esm = await import(`${new URL("./index.js", new URL(`file://${packageDirectory}/`))}`);
const require = createRequire(import.meta.url);
const commonJs = require(join(packageDirectory, "index.cjs"));
const core = await import(`${new URL("./core.js", new URL(`file://${packageDirectory}/`))}`);

if (typeof esm.Device !== "function" || typeof commonJs.Device !== "function") {
  throw new Error("Device is not exported from both ESM and CommonJS builds");
}
if (esm.presets.routes.rotterdamWarsaw.metadata.id !== "rotterdam-warsaw") {
  throw new Error("Route presets are not available in the ESM build");
}
if (typeof core.createVehicleSimulator !== "function") {
  throw new Error("The /core export is missing createVehicleSimulator");
}
if (manifest.exports?.["."]?.types !== "./types/library/index.d.ts") {
  throw new Error("The package manifest does not point at the public declarations");
}
if (!existsSync(join(packageDirectory, "README.md"))) {
  throw new Error("The package README is missing from the published artifact");
}

const tempDirectory = mkdtempSync(join("/tmp", "teltonika-simulator-package-"));
try {
  const scopedDirectory = join(tempDirectory, "node_modules", "@company");
  const packageLink = join(scopedDirectory, "teltonika-simulator");
  mkdir(scopedDirectory);
  symlinkSync(packageDirectory, packageLink, "dir");
  writeFileSync(join(tempDirectory, "consumer.ts"), `
import { Device, presets } from "@company/teltonika-simulator";
import { createVehicleSimulator } from "@company/teltonika-simulator/core";

const device = new Device({
  imei: "123456789012345",
  host: "127.0.0.1",
  port: 5027,
  route: presets.routes.rotterdamWarsaw,
});
device.update({ drivingStyle: presets.drivingStyles.aggressive });
void device.done;
void createVehicleSimulator;
`, "utf8");
  writeFileSync(join(tempDirectory, "tsconfig.json"), JSON.stringify({
    compilerOptions: {
      target: "ES2022",
      module: "NodeNext",
      moduleResolution: "NodeNext",
      strict: true,
      noEmit: true,
      skipLibCheck: true,
    },
  }), "utf8");
  execFileSync(process.execPath, [resolve("node_modules/typescript/bin/tsc"), "-p", join(tempDirectory, "tsconfig.json")], {
    stdio: "inherit",
  });
} finally {
  rmSync(tempDirectory, { recursive: true, force: true });
}

function mkdir(path) {
  const parent = resolve(path, "..");
  if (parent !== path) {
    mkdir(parent);
  }
  try {
    readdirSync(path);
  } catch {
    const { mkdirSync } = require("node:fs");
    mkdirSync(path);
  }
}
