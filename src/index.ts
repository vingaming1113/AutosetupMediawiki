#!/usr/bin/env bun

import * as p from "@clack/prompts";
import chalk from "chalk";
import { generateProject } from "./generator";
import { showSummary } from "./summary";
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
    const progress = p.spinner();
    progress.start("Creating your MediaWiki project");
    try {
      const project = await generateProject(config);
      progress.stop("Setup files are ready");
      showSummary(config, project.directory);
    } catch (error) {
      progress.stop("Setup stopped");
      throw error;
    }
  } catch {
    console.error(chalk.red(
      "\nSetup failed. Error details were hidden to protect passwords. "
      + "Check Docker's status and retry.",
    ));
    process.exitCode = 1;
  }
}
