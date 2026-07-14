#!/usr/bin/env bun

import chalk from "chalk";
import { generateProject } from "./generator";
import { promptForConfig } from "./ui";

const VERSION = "0.1.0";

function printHelp(): void {
  console.log(`mediawiki-autosetup ${VERSION}

Create a friendly, Docker-powered MediaWiki installation.

Usage:
  bun run start
  mediawiki-autosetup [options]

Options:
  -h, --help       Show this help
  -v, --version    Show the version`);
}

const args = new Set(Bun.argv.slice(2));

if (args.has("--help") || args.has("-h")) {
  printHelp();
} else if (args.has("--version") || args.has("-v")) {
  console.log(VERSION);
} else {
  try {
    const config = await promptForConfig();
    const project = await generateProject(config);
    console.log(chalk.green("\n✓ Setup files created."));
    console.log(chalk.dim(`  ${project.directory}`));
  } catch (error) {
    console.error(chalk.red("\nSetup failed:"), error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

