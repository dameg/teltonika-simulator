import {
  ActionIcon,
  Tooltip,
  useComputedColorScheme,
  useMantineColorScheme,
} from "@mantine/core";
import { Moon, Sun } from "lucide-react";
import { memo, type ReactElement } from "react";

export const ColorSchemeToggle = memo(function ColorSchemeToggle(): ReactElement {
  const colorScheme = useComputedColorScheme("light", {
    getInitialValueInEffect: false,
  });
  const { setColorScheme } = useMantineColorScheme();
  const nextColorScheme = colorScheme === "dark" ? "light" : "dark";
  const label = colorScheme === "dark" ? "Switch to light mode" : "Switch to dark mode";

  return (
    <Tooltip label={label}>
      <ActionIcon
        aria-label={label}
        className="theme-toggle"
        onClick={() => setColorScheme(nextColorScheme)}
        size="lg"
        variant="subtle"
      >
        {colorScheme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
      </ActionIcon>
    </Tooltip>
  );
});
