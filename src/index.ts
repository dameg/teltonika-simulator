export function simulatorName(): string {
  return "teltonika-simulator";
}

if (require.main === module) {
  console.log(simulatorName());
}
