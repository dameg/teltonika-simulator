import { parseConfig } from "./config";

export { helpText, parseConfig } from "./config";

export function simulatorName(): string {
  return "teltonika-simulator";
}

if (require.main === module) {
  try {
    const result = parseConfig();
    if (result.kind === "help") {
      console.log(result.help);
      process.exit(0);
    }

    console.log(JSON.stringify(result.config, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
