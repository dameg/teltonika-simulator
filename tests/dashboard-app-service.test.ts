import { describe, expect, it } from "vitest";

import { AppService } from "../src/dashboard/app.service";

describe("dashboard shell theme bootstrap", () => {
  it("sets the persisted color scheme before loading dashboard styles", () => {
    const service = new AppService(undefined as never);
    const shell = service.renderShellHtml();
    const themeBootstrapIndex = shell.indexOf("teltonika-dashboard-color-scheme");
    const stylesheetIndex = shell.indexOf('<link rel="stylesheet" href="/dashboard-app.css">');

    expect(themeBootstrapIndex).toBeGreaterThan(-1);
    expect(shell).toContain("prefers-color-scheme: dark");
    expect(shell).toContain("data-mantine-color-scheme");
    expect(themeBootstrapIndex).toBeLessThan(stylesheetIndex);
  });
});
