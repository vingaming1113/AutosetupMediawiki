import chalk from "chalk";
import { captchaLabel } from "./captcha";
import type { WikiConfig } from "./config";

function truncate(value: string, length: number): string {
  return value.length > length ? `${value.slice(0, length - 1)}…` : value;
}

export function showSummary(config: WikiConfig, directory: string): void {
  const width = Math.max(64, Math.min(84, process.stdout.columns ?? 72));
  const inside = width - 4;
  const title = "SETUP FILES ARE READY";
  const line = (label: string, value: string): string => {
    const content = `${label.padEnd(13)} ${truncate(value, inside - 14)}`;
    return `│ ${content.padEnd(inside)} │`;
  };
  const border = chalk.hex("#a78bfa");
  console.log();
  console.log(border(`╭${"─".repeat(width - 2)}╮`));
  console.log(border(`│ ${title.padEnd(inside)} │`));
  console.log(border(`├${"─".repeat(width - 2)}┤`));
  console.log(line("Status", "Files generated"));
  console.log(line("Wiki", config.wikiName));
  console.log(line("URL", config.siteUrl));
  console.log(line("Admin", config.adminUser));
  console.log(line("CAPTCHA", captchaLabel(config.captcha)));
  console.log(line("Extensions", config.extensions.length ? config.extensions.join(", ") : "None"));
  console.log(line("Files", directory));
  console.log(border(`├${"─".repeat(width - 2)}┤`));
  console.log(line("Install", "docker compose run --rm mediawiki-install"));
  console.log(line("Start", "docker compose up -d"));
  console.log(line("Stop", "docker compose down"));
  console.log(border(`╰${"─".repeat(width - 2)}╯`));
  console.log(chalk.dim("\nKeep the generated .env file private; it contains your passwords."));
}
