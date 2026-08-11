import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createTheme, localStorageColorSchemeManager, MantineProvider } from "@mantine/core";

import { App } from "./App";
import "@mantine/core/styles.css";
import "./dashboard.css";

const rootElement = document.getElementById("root");
const colorSchemeManager = localStorageColorSchemeManager({
  key: "teltonika-dashboard-color-scheme",
});
const theme = createTheme({
  primaryColor: "teal",
  primaryShade: 7,
  defaultRadius: "sm",
  fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  fontFamilyMonospace: "SFMono-Regular, Consolas, 'Liberation Mono', monospace",
  headings: {
    fontFamily: "'Arial Narrow', 'Avenir Next Condensed', 'Roboto Condensed', Inter, sans-serif",
    fontWeight: "700",
  },
});

if (!rootElement) {
  throw new Error('Dashboard root element "#root" was not found.');
}

createRoot(rootElement).render(
  <StrictMode>
    <MantineProvider
      colorSchemeManager={colorSchemeManager}
      defaultColorScheme="auto"
      theme={theme}
    >
      <App />
    </MantineProvider>
  </StrictMode>
);
