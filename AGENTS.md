# AGENTS.md

These instructions apply to the entire repository.

## Project purpose

MediaWiki Autosetup is a Bun and TypeScript terminal wizard. It collects friendly setup choices, generates a Docker Compose project for MediaWiki and MariaDB, optionally performs the installation, and prints a final summary card.

Keep the experience approachable for people who have never configured MediaWiki manually.

## Repository map

- `src/index.ts` — CLI entry point, flags, orchestration, and progress feedback.
- `src/ui.ts` — gradient banner and interactive Clack prompts.
- `src/config.ts` — shared configuration types, extension catalog, and password generation.
- `src/generator.ts` — generated Compose, environment, PHP settings, and project files.
- `src/installer.ts` — Docker detection and unattended MediaWiki installation.
- `src/summary.ts` — final terminal result card.
- `tests/` — Bun tests for configuration and generated projects.
- `.github/workflows/ci.yml` — frozen install, audit, type-check, tests, and CLI smoke test.
- `.github/ISSUE_TEMPLATE/` — structured contributor issue forms.

## Required commands

Run these before handing off a change:

```sh
bun install --frozen-lockfile
bun audit
bun run typecheck
bun test
bun run src/index.ts --help
bun run src/index.ts --version
```

If a change affects the interactive flow, exercise the full wizard in a disposable environment and cover both Docker-present and Docker-missing behavior where practical.

## Implementation rules

- Use Bun APIs and strict TypeScript.
- Keep prompts keyboard-friendly; preserve arrow-key navigation, Space selection, Enter confirmation, and cancellation handling.
- Keep dependencies minimal and pin direct dependency versions exactly.
- Do not update `bun.lock` without reviewing the resolved dependency tree and running `bun audit`.
- Do not fetch arbitrary URLs or execute downloaded scripts. Prefer official documentation and package-manager metadata.
- Pass subprocess arguments as arrays through `Bun.spawn`; never interpolate user input into a shell command.
- Validate paths, ports, and URLs before generating files or starting services.
- Never print passwords, tokens, database secrets, or complete `.env` contents.
- Never commit generated `.env` files, wiki uploads, database data, or user-provided logos.
- Refuse to overwrite non-empty output directories unless a future design adds explicit, tested user confirmation.
- Avoid destructive filesystem and Git operations. Test cleanup may remove only directories created by that test with `mkdtemp`.

## Docker and MediaWiki rules

- Use official, deliberately pinned MediaWiki and MariaDB image versions.
- Preserve persistent storage for the database, MediaWiki installation, and uploads.
- Keep database readiness checks and clear timeout errors.
- A missing Docker installation must not discard generated files.
- Treat `LocalSettings.autosetup.php` as generated user configuration and keep extension names compatible with the pinned MediaWiki release.
- Do not claim Docker installation succeeded until the services and MediaWiki installer complete successfully.

## Testing expectations

Add or update tests when changing:

- password or default configuration behavior;
- template rendering or generated filenames;
- credential escaping;
- overwrite protection;
- Docker fallback behavior;
- extension or logo configuration.

Tests must use temporary directories and remove only their own temporary data. Do not depend on a developer's existing Docker volumes, wiki files, credentials, or network access.

## Documentation and commits

- Update `README.md` whenever setup steps, requirements, generated files, commands, or safety behavior change.
- Keep issue forms aligned with the information needed to reproduce current failures.
- Use focused commits with terse imperative messages.
- Do not combine unrelated features, formatting, dependency updates, and fixes in one commit.
- Preserve user changes already present in the worktree.

## Security boundary

This tool handles administrator and database passwords. Treat every log line, error message, generated file, test fixture, and subprocess invocation as potentially sensitive. Redact secrets in diagnostics and examples, and favor safe failure with actionable recovery instructions.
