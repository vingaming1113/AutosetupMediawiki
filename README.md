# MediaWiki Autosetup

A friendly Bun-powered terminal wizard that creates and optionally starts a complete MediaWiki installation with Docker.

The wizard lets you name your wiki, choose its language and URL, add a custom logo, create an administrator, and enable useful bundled extensions. Menus use the arrow keys and Space, and the finished setup is summarized in one clear card.

## What it sets up

- MediaWiki 1.46 on the official Docker image
- MariaDB 11.4 with persistent storage and health checks
- A private generated database password
- Your wiki name, language, public URL, and administrator
- An optional logo copied into the uploads directory
- VisualEditor, WikiEditor, Cite, ParserFunctions, TemplateData, Scribunto, SyntaxHighlight, and Nuke
- Persistent wiki, database, and upload data

## Requirements

- [Bun](https://bun.sh/) 1.1 or newer
- [Docker](https://docs.docker.com/get-docker/) with Docker Compose for one-click installation

Docker is optional while generating the files. If it is unavailable, the wizard still creates the project and tells you how to continue later.

## Quick start

```sh
git clone https://github.com/vingaming1113/AutosetupMediawiki.git
cd AutosetupMediawiki
bun install --frozen-lockfile
bun start
```

Use **Up/Down** to move through a menu, **Space** to select extensions, and **Enter** to confirm.

The default output is `./mediawiki-setup`. When automatic installation succeeds, open the URL shown in the final card and sign in with the administrator account you created.

## Generated project

| File | Purpose |
| --- | --- |
| `compose.yml` | MediaWiki and MariaDB services |
| `.env` | Ports, generated database secrets, and setup values |
| `LocalSettings.autosetup.php` | Wiki name, URL, logo, uploads, and extensions |
| `data/images/` | Persistent uploads and the optional logo |
| `README.md` | Commands for the generated wiki |

Inside the generated directory:

```sh
docker compose up -d      # start
docker compose logs -f    # inspect logs
docker compose down       # stop without deleting data
```

Do not run `docker compose down -v` unless you intentionally want to delete the wiki and database volumes.

## Public websites

The generated stack serves HTTP on the port selected in the wizard. For a public `https://wiki.example.com` address, put it behind a reverse proxy such as Caddy, Traefik, or nginx and configure TLS and DNS separately. The URL entered in the wizard should be the final address visitors will use.

## Backups and security

- Keep the generated `.env` private; it contains passwords and is ignored by Git.
- Back up the MariaDB and MediaWiki Docker volumes as well as `data/images/`.
- Update the pinned MediaWiki and MariaDB image versions deliberately and test backups before upgrading.
- Run `bun audit` when updating JavaScript dependencies.
- This project refuses to overwrite a non-empty output directory.

## Development

```sh
bun install --frozen-lockfile
bun run typecheck
bun test
bun run start --help
```

## Troubleshooting

If setup stops while Docker is starting, go to the generated directory and run:

```sh
docker compose ps
docker compose logs database mediawiki
```

Port conflicts can be fixed by running the wizard again with a different port and a new output directory.

## License

MIT. MediaWiki is a trademark of the Wikimedia Foundation; this independent utility is not affiliated with or endorsed by the Wikimedia Foundation.
