#!/usr/bin/env bun

import chalk from "chalk";

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
  console.log(chalk.cyan("MediaWiki Autosetup is ready."));
  console.log(chalk.dim("Run with --help to see the available options."));
}

