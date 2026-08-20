import { runCli } from "./cli-runner";

if (require.main === module) {
  void runCli().then(
    (exitCode) => {
      process.exit(exitCode);
    },
    (error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  );
}
