# MediaWiki Autosetup

<div align="center">

[![CI](https://img.shields.io/github/actions/workflow/status/vingaming1113/AutosetupMediawiki/ci.yml?branch=main&style=for-the-badge&logo=githubactions&logoColor=white&label=CI)](https://github.com/vingaming1113/AutosetupMediawiki/actions/workflows/ci.yml)
[![Version](https://img.shields.io/github/package-json/v/vingaming1113/AutosetupMediawiki?style=for-the-badge&logo=bun&logoColor=white&label=version)](https://github.com/vingaming1113/AutosetupMediawiki/blob/main/package.json)
![MediaWiki](https://img.shields.io/badge/MediaWiki-1.46-36c?style=for-the-badge&logo=mediawiki&logoColor=white)
[![License](https://img.shields.io/github/license/vingaming1113/AutosetupMediawiki?style=for-the-badge)](https://github.com/vingaming1113/AutosetupMediawiki/blob/main/LICENSE)

[![Stars](https://img.shields.io/github/stars/vingaming1113/AutosetupMediawiki?style=for-the-badge&logo=github&label=stars)](https://github.com/vingaming1113/AutosetupMediawiki/stargazers)
[![Open issues](https://img.shields.io/github/issues/vingaming1113/AutosetupMediawiki?style=for-the-badge&logo=github&label=open%20issues)](https://github.com/vingaming1113/AutosetupMediawiki/issues)
![Repository size](https://img.shields.io/github/repo-size/vingaming1113/AutosetupMediawiki?style=for-the-badge&label=repo%20size)
[![Last commit](https://img.shields.io/github/last-commit/vingaming1113/AutosetupMediawiki?style=for-the-badge&logo=git&label=last%20commit)](https://github.com/vingaming1113/AutosetupMediawiki/commits/main)

</div>

A friendly Bun-powered terminal wizard that creates and optionally starts a complete MediaWiki installation with Docker.

Name your wiki, choose its language and URL, add a custom logo, create an administrator, and enable useful bundled extensions without manually writing Docker Compose or PHP configuration. Menus use the arrow keys and Space, and the finished setup appears in one clear summary card.

The cards above are live project statistics from GitHub and Shields.io, so build health, version, issue count, repository size, and activity remain current.

## Highlights

- Guided terminal interface with a cyan, violet, and rose gradient banner
- Arrow-key menus and a Space-driven extension picker
- MediaWiki 1.46 and MariaDB 11.4 on official container images
- Persistent wiki, database, and upload storage
- Generated database secrets and private `.env` handling
- Optional logo configuration
- Automatic installation when Docker Compose is available
- Safe generated-files fallback when Docker is unavailable
- Final card showing the URL, administrator, extensions, files, and commands

## Extensions

Choose any combination of these bundled MediaWiki extensions:

- VisualEditor
- WikiEditor
- Cite
- ParserFunctions
- TemplateData
- Scribunto
- SyntaxHighlight
- Nuke

## Requirements

- [Bun](https://bun.sh/) 1.1 or newer
- [Docker](https://docs.docker.com/get-docker/) with Docker Compose for one-click installation

Docker is optional while generating the files. If it is unavailable, the wizard still creates the complete project and explains how to continue later.

## Quick start

```sh
git clone https://github.com/vingaming1113/AutosetupMediawiki.git
cd AutosetupMediawiki
bun install --frozen-lockfile
bun start
```

Use **Up/Down** to move through menus, **Space** to toggle extensions, and **Enter** to confirm.

The default output directory is `./mediawiki-setup`. When automatic installation succeeds, open the URL displayed in the final card and sign in using the administrator account you created.

## Generated project

| File | Purpose |
| --- | --- |
| `compose.yml` | MediaWiki and MariaDB services |
| `.env` | Port, setup values, and generated database secrets |
| `LocalSettings.autosetup.php` | Wiki name, URL, logo, uploads, and extensions |
| `data/images/` | Persistent uploads and the optional logo |
| `README.md` | Commands for operating the generated wiki |

From inside the generated directory:

```sh
docker compose up -d
docker compose logs -f
docker compose down
```

Do not run `docker compose down -v` unless you intentionally want to delete the wiki and database volumes.

## Public websites

The generated stack serves HTTP on the selected port. For a public address such as `https://wiki.example.com`, place it behind Caddy, Traefik, nginx, or another reverse proxy and configure TLS and DNS separately. Enter the final visitor-facing URL in the wizard.

## Backups and security

- Keep `.env` private; it contains passwords and is ignored by Git.
- Back up the MariaDB and MediaWiki volumes plus `data/images/`.
- Test backups before changing pinned MediaWiki or MariaDB image versions.
- Run `bun audit` whenever JavaScript dependencies change.
- Never paste credentials or private URLs into public issue reports.
- The generator refuses to overwrite a non-empty output directory.

## Development

```sh
bun install --frozen-lockfile
bun audit
bun run typecheck
bun test
bun run start --help
```

The CI workflow performs the frozen install, dependency audit, type-check, tests, and CLI smoke test for every pull request.

## Troubleshooting

If setup stops while Docker is starting, enter the generated directory and run:

```sh
docker compose ps
docker compose logs database mediawiki
```

For a port conflict, run the wizard again with a different port and a new output directory.

## Community

- [Report a reproducible bug](https://github.com/vingaming1113/AutosetupMediawiki/issues/new?template=01-bug-report.yml)
- [Suggest a feature](https://github.com/vingaming1113/AutosetupMediawiki/issues/new?template=02-feature-request.yml)
- [Browse current issues](https://github.com/vingaming1113/AutosetupMediawiki/issues)

Please remove passwords, tokens, private URLs, and other sensitive information from issue reports and logs.

## License

MIT. MediaWiki is a trademark of the Wikimedia Foundation; this independent utility is not affiliated with or endorsed by the Wikimedia Foundation.
