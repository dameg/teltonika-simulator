import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import "@mantine/core/styles.css";
import "./dashboard.css";
import { createTheme, MantineProvider } from "@mantine/core";

const rootElement = document.getElementById("root");
const theme = createTheme({
  primaryColor: "blue",
  primaryShade: 7,
  defaultRadius: "md",
  fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  headings: { fontFamily: "inherit", fontWeight: "650" }
});

if (!rootElement) {
  throw new Error('Dashboard root element "#root" was not found.');
}

createRoot(rootElement).render(
  <StrictMode>
    <MantineProvider theme={theme}>
      <App />
    </MantineProvider>
  </StrictMode>
);
