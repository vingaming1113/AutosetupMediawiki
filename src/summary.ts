import chalk from "chalk";
import type { WikiConfig } from "./config";
import type { InstallResult } from "./installer";

function truncate(value: string, length: number): string {
  return value.length > length ? `${value.slice(0, length - 1)}…` : value;
}

export function showSummary(config: WikiConfig, directory: string, result: InstallResult): void {
  const width = Math.max(64, Math.min(84, process.stdout.columns ?? 72));
  const inside = width - 4;
  const line = (label: string, value: string): string => {
    const content = `${label.padEnd(13)} ${truncate(value, inside - 14)}`;
    return `│ ${content.padEnd(inside)} │`;
  };
  const border = chalk.hex("#a78bfa");
  console.log();
  console.log(border(`╭${"─".repeat(width - 2)}╮`));
  console.log(border(`│ ${"YOUR WIKI IS READY".padEnd(inside)} │`));
  console.log(border(`├${"─".repeat(width - 2)}┤`));
  console.log(line("Status", result.installed ? "Running with Docker ✓" : result.reason ?? "Files generated"));
  console.log(line("Wiki", config.wikiName));
  console.log(line("URL", config.siteUrl));
  console.log(line("Admin", config.adminUser));
  console.log(line("Extensions", config.extensions.length ? config.extensions.join(", ") : "None"));
  console.log(line("Files", directory));
  console.log(border(`├${"─".repeat(width - 2)}┤`));
  console.log(line("Start", "docker compose up -d"));
  console.log(line("Stop", "docker compose down"));
  console.log(border(`╰${"─".repeat(width - 2)}╯`));
  console.log(chalk.dim("\nKeep the generated .env file private; it contains your passwords."));
}
