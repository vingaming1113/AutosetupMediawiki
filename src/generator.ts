import { chmod, copyFile, mkdir, readdir, writeFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import {
  CAP_CAPTCHA_AUTHENTICATION_REQUEST,
  CAP_CAPTCHA_CLASS,
  CAP_CAPTCHA_FIELD,
  CAP_EXTENSION_MANIFEST,
  CAP_INIT_SCRIPT,
  captchaEnvironmentVariables,
  mediaWikiCaptchaEnvironmentNames,
  renderCaptchaSettings,
} from "./captcha";
import type { WikiConfig } from "./config";

export interface GeneratedProject {
  directory: string;
  logoFilename?: string;
}

const phpQuote = (value: string): string => value.replaceAll("\\", "\\\\").replaceAll("'", "\\'");

function renderCompose(config: WikiConfig): string {
  const captchaVariableNames = mediaWikiCaptchaEnvironmentNames(config.captcha);
  const captchaEnvironment = captchaVariableNames.length > 0
    ? `    environment:\n${captchaVariableNames.map((name) => `      ${name}: \${${name}}`).join("\n")}\n`
    : "";
  const captchaVolume = config.captcha.provider === "cap"
    ? "      - ./extensions/CapCaptcha:/var/www/html/extensions/CapCaptcha:ro\n"
    : "";
  const automaticCap = config.captcha.provider === "cap" && config.captcha.deployment === "automatic";
  const capServices = automaticCap ? `
  cap-valkey:
    image: valkey/valkey:9.0.4-alpine
    restart: unless-stopped
    command: ["valkey-server", "--save", "60", "1", "--loglevel", "warning", "--maxmemory-policy", "noeviction"]
    volumes:
      - cap-valkey-data:/data
    healthcheck:
      test: ["CMD", "valkey-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 10

  cap:
    image: tiago2/cap:3.1.5
    restart: unless-stopped
    ports:
      - "\${CAP_STANDALONE_PORT}:3000"
    environment:
      ADMIN_KEY: \${CAP_STANDALONE_ADMIN_KEY}
      REDIS_URL: redis://cap-valkey:6379
      CORS_ORIGIN: \${WIKI_ORIGIN}
      ENABLE_ASSETS_SERVER: "true"
      WIDGET_VERSION: "0.1.56"
      WASM_VERSION: "0.0.7"
    depends_on:
      cap-valkey:
        condition: service_healthy

  cap-init:
    image: tiago2/cap:3.1.5
    user: "0:0"
    restart: "no"
    depends_on:
      cap:
        condition: service_started
    environment:
      CAP_STANDALONE_ADMIN_KEY: \${CAP_STANDALONE_ADMIN_KEY}
      WIKI_URL: \${WIKI_URL}
    entrypoint: ["bun", "run", "/autosetup/cap-init.ts"]
    volumes:
      - ./cap-init.ts:/autosetup/cap-init.ts:ro
      - cap-credentials:/cap-data
` : "";
  const capDependency = automaticCap
    ? "      cap-init:\n        condition: service_completed_successfully\n"
    : "";
  const capCredentialsVolume = automaticCap
    ? "      - cap-credentials:/run/cap:ro\n"
    : "";
  const capVolume = automaticCap ? "  cap-valkey-data:\n  cap-credentials:\n" : "";
  return `services:
  database:
    image: mariadb:11.4
    restart: unless-stopped
    environment:
      MARIADB_DATABASE: mediawiki
      MARIADB_USER: mediawiki
      MARIADB_PASSWORD: \${DATABASE_PASSWORD}
      MARIADB_ROOT_PASSWORD: \${DATABASE_ROOT_PASSWORD}
    volumes:
      - database-data:/var/lib/mysql
    healthcheck:
      test: ["CMD", "healthcheck.sh", "--connect", "--innodb_initialized"]
      interval: 5s
      timeout: 5s
      retries: 20
${capServices}

  mediawiki-install:
    image: mediawiki:1.46.0
    restart: "no"
    depends_on:
      database:
        condition: service_healthy
    environment:
      WIKI_NAME: \${WIKI_NAME}
      WIKI_LANGUAGE: \${WIKI_LANGUAGE}
      WIKI_URL: \${WIKI_URL}
      WIKI_ADMIN: \${WIKI_ADMIN}
      WIKI_ADMIN_PASSWORD: \${WIKI_ADMIN_PASSWORD}
      DATABASE_PASSWORD: \${DATABASE_PASSWORD}
    command: ["php", "/autosetup/install.php"]
    volumes:
      - wiki-data:/var/www/html
      - ./install.php:/autosetup/install.php:ro
      - ./LocalSettings.autosetup.php:/var/www/html/LocalSettings.autosetup.php:ro

  mediawiki:
    image: mediawiki:1.46.0
    restart: unless-stopped
    ports:
      - "\${WIKI_PORT}:80"
    depends_on:
      database:
        condition: service_healthy
      mediawiki-install:
        condition: service_completed_successfully
${capDependency}${captchaEnvironment}
    volumes:
      - wiki-data:/var/www/html
      - ./data/images:/var/www/html/images
      - ./LocalSettings.autosetup.php:/var/www/html/LocalSettings.autosetup.php:ro
${captchaVolume}${capCredentialsVolume}

volumes:
  database-data:
  wiki-data:
${capVolume}
`;
}

function renderInstaller(): string {
  return `<?php
declare(strict_types=1);

const LOCAL_SETTINGS = '/var/www/html/LocalSettings.php';
const CUSTOM_SETTINGS = "require_once '/var/www/html/LocalSettings.autosetup.php';";

if (is_file(LOCAL_SETTINGS)) {
    $settings = file_get_contents(LOCAL_SETTINGS);
    if (is_string($settings) && str_contains($settings, CUSTOM_SETTINGS)) {
        fwrite(STDOUT, "MediaWiki is already installed.\n");
        exit(0);
    }

    fwrite(STDERR, "LocalSettings.php exists, but automatic setup is incomplete.\n");
    exit(1);
}

function requiredEnvironment(string $name): string
{
    $value = getenv($name);
    if (!is_string($value) || $value === '') {
        throw new RuntimeException("Missing required setup value: {$name}");
    }
    return $value;
}

function writeSecretFile(string $prefix, string $value): string
{
    $path = tempnam('/tmp', $prefix);
    if ($path === false || file_put_contents($path, $value, LOCK_EX) === false) {
        if (is_string($path)) {
            @unlink($path);
        }
        throw new RuntimeException('Could not create a temporary credential file.');
    }
    chmod($path, 0600);
    return $path;
}

$url = requiredEnvironment('WIKI_URL');
$urlParts = parse_url($url);
if (!is_array($urlParts) || !isset($urlParts['scheme'], $urlParts['host'])) {
    throw new RuntimeException('WIKI_URL must be a full HTTP or HTTPS URL.');
}
$host = (string)$urlParts['host'];
if (str_contains($host, ':') && !str_starts_with($host, '[')) {
    $host = "[{$host}]";
}
$server = $urlParts['scheme'] . '://' . $host;
if (isset($urlParts['port'])) {
    $server .= ':' . $urlParts['port'];
}
$scriptPath = isset($urlParts['path']) ? rtrim((string)$urlParts['path'], '/') : '';

$adminPasswordFile = writeSecretFile('wiki-admin-', requiredEnvironment('WIKI_ADMIN_PASSWORD'));
$databasePasswordFile = writeSecretFile('wiki-db-', requiredEnvironment('DATABASE_PASSWORD'));
$command = [
    'php', '/var/www/html/maintenance/run.php', 'install',
    '--server=' . $server,
    '--scriptpath=' . $scriptPath,
    '--dbtype=mysql',
    '--dbserver=database',
    '--dbname=mediawiki',
    '--dbuser=mediawiki',
    '--dbpassfile=' . $databasePasswordFile,
    '--lang=' . requiredEnvironment('WIKI_LANGUAGE'),
    '--passfile=' . $adminPasswordFile,
    requiredEnvironment('WIKI_NAME'),
    requiredEnvironment('WIKI_ADMIN'),
];
$descriptors = [
    0 => ['file', '/dev/null', 'r'],
    1 => STDOUT,
    2 => STDERR,
];

try {
    $process = proc_open($command, $descriptors, $pipes, '/var/www/html');
    if (!is_resource($process)) {
        throw new RuntimeException('Could not start the MediaWiki installer.');
    }
    $exitCode = proc_close($process);
} finally {
    @unlink($adminPasswordFile);
    @unlink($databasePasswordFile);
}

if ($exitCode !== 0) {
    exit($exitCode);
}
if (file_put_contents(LOCAL_SETTINGS, "\n" . CUSTOM_SETTINGS . "\n", FILE_APPEND | LOCK_EX) === false) {
    throw new RuntimeException('Could not finish LocalSettings.php.');
}

fwrite(STDOUT, "MediaWiki installation complete.\n");
`;
}

const dotenvQuote = (value: string | number): string => `'${String(value).replaceAll("'", "\\'")}'`;

function renderEnvironment(config: WikiConfig): string {
  const values = [
    `COMPOSE_PROJECT_NAME=${dotenvQuote(`mediawiki-autosetup-${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`)}`,
    `WIKI_PORT=${dotenvQuote(config.port)}`,
    `WIKI_NAME=${dotenvQuote(config.wikiName)}`,
    `WIKI_LANGUAGE=${dotenvQuote(config.language)}`,
    `WIKI_URL=${dotenvQuote(config.siteUrl)}`,
    `WIKI_ORIGIN=${dotenvQuote(new URL(config.siteUrl).origin)}`,
    `WIKI_ADMIN=${dotenvQuote(config.adminUser)}`,
    `WIKI_ADMIN_PASSWORD=${dotenvQuote(config.adminPassword)}`,
    `DATABASE_PASSWORD=${dotenvQuote(config.databasePassword)}`,
    `DATABASE_ROOT_PASSWORD=${dotenvQuote(crypto.randomUUID().replaceAll("-", ""))}`,
  ];
  for (const [name, value] of captchaEnvironmentVariables(config.captcha)) {
    values.push(`${name}=${dotenvQuote(value)}`);
  }
  return [...values, ""].join("\n");
}

function renderSettings(config: WikiConfig, logoFilename?: string): string {
  const url = new URL(config.siteUrl);
  const scriptPath = url.pathname === "/" ? "" : url.pathname.replace(/\/$/, "");
  const extensions = config.extensions.map((name) => `wfLoadExtension( '${phpQuote(name)}' );`).join("\n");
  const logo = logoFilename
    ? `\n$wgLogos = [ '1x' => "$wgScriptPath/images/${phpQuote(logoFilename)}" ];`
    : "";

  return `<?php
// Generated by MediaWiki Autosetup. Safe to customize after installation.
$wgSitename = '${phpQuote(config.wikiName)}';
$wgServer = '${phpQuote(url.origin)}';
$wgScriptPath = '${phpQuote(scriptPath)}';
$wgEnableUploads = true;
$wgUseInstantCommons = true;
$wgEmergencyContact = 'admin@localhost';
$wgPasswordSender = 'admin@localhost';
${logo}

// Selected bundled extensions
${extensions}
${renderCaptchaSettings(config.captcha)}
`;
}

function renderCaptchaReadme(config: WikiConfig): string {
  switch (config.captcha.provider) {
    case "cap":
      if (config.captcha.deployment === "automatic") {
        return `
## Cap CAPTCHA

This project automatically runs Cap Standalone at ${config.captcha.serverUrl}. The first start creates a site key with ${new URL(config.siteUrl).origin} as its allowed origin before MediaWiki starts.

The Cap dashboard uses the private \`CAP_STANDALONE_ADMIN_KEY\` in \`.env\`. Generated site credentials are stored in the private \`cap-credentials\` Docker volume. Keep both private and back up the \`cap-valkey-data\` and \`cap-credentials\` volumes.
`;
      }
      return `
## Cap CAPTCHA

This wiki uses the self-hosted [Cap CAPTCHA](https://github.com/tiagozip/cap). Keep the Cap asset server enabled and publicly reachable at ${config.captcha.serverUrl}. In the Cap dashboard, allow ${config.siteUrl} as a CORS origin.

Pin the Cap asset server to \`WIDGET_VERSION=0.1.56\` and \`WASM_VERSION=0.0.7\`.

The site secret is stored only in \`.env\`; never paste it into logs or issue reports.
`;
    case "turnstile":
      return `
## Cloudflare Turnstile

This wiki uses Cloudflare Turnstile through MediaWiki's bundled ConfirmEdit extension. Register the visitor-facing hostname for ${config.siteUrl} in the Cloudflare Turnstile dashboard.

The secret key is stored only in \`.env\`; never paste it into logs or issue reports.
`;
    case "hcaptcha":
      return `
## hCaptcha

This wiki uses hCaptcha through MediaWiki's bundled ConfirmEdit extension. Register the visitor-facing hostname for ${config.siteUrl} in the hCaptcha dashboard.

The secret key is stored only in \`.env\`; never paste it into logs or issue reports.
`;
    case "recaptcha":
      return `
## Google reCAPTCHA v2

This wiki uses Google reCAPTCHA v2 through MediaWiki's bundled ConfirmEdit extension. Register the visitor-facing hostname for ${config.siteUrl} in the Google reCAPTCHA admin console.

The secret key is stored only in \`.env\`; never paste it into logs or issue reports.
`;
    case "none":
      return "";
  }
}

function renderReadme(config: WikiConfig): string {
  return `# ${config.wikiName}

Generated by MediaWiki Autosetup.

## Start and stop

\`\`\`sh
docker compose up -d
docker compose down
\`\`\`

Open ${config.siteUrl} after the installation completes.

The first \`docker compose up -d\` automatically creates \`LocalSettings.php\` and installs MediaWiki. Follow progress with \`docker compose logs -f mediawiki-install mediawiki\`.

Configuration secrets are stored in \`.env\` and ignored files under \`data/\`. Keep them private and back up all persistent storage regularly.
${renderCaptchaReadme(config)}
`;
}

export async function generateProject(config: WikiConfig): Promise<GeneratedProject> {
  const directory = resolve(config.outputDirectory);
  await mkdir(directory, { recursive: true });
  const existing = await readdir(directory);
  if (existing.length > 0) throw new Error(`The output directory is not empty: ${directory}`);

  await mkdir(resolve(directory, "data/images"), { recursive: true });
  await chmod(resolve(directory, "data/images"), 0o777);
  let logoFilename: string | undefined;
  if (config.logoPath) {
    const suffix = extname(config.logoPath).toLowerCase() || ".png";
    logoFilename = `wiki-logo${suffix}`;
    await copyFile(resolve(config.logoPath), resolve(directory, "data/images", logoFilename));
  }

  if (config.captcha.provider === "cap") {
    await mkdir(resolve(directory, "extensions/CapCaptcha/includes"), { recursive: true });
  }
  await Promise.all([
    writeFile(resolve(directory, "compose.yml"), renderCompose(config)),
    writeFile(resolve(directory, ".env"), renderEnvironment(config), { mode: 0o600 }),
    writeFile(resolve(directory, "install.php"), renderInstaller()),
    writeFile(resolve(directory, "LocalSettings.autosetup.php"), renderSettings(config, logoFilename)),
    writeFile(resolve(directory, ".gitignore"), ".env\ndata/\n"),
    writeFile(resolve(directory, "README.md"), renderReadme(config)),
    ...(config.captcha.provider === "cap" && config.captcha.deployment === "automatic"
      ? [writeFile(resolve(directory, "cap-init.ts"), CAP_INIT_SCRIPT)]
      : []),
    ...(config.captcha.provider === "cap" ? [
      writeFile(resolve(directory, "extensions/CapCaptcha/extension.json"), CAP_EXTENSION_MANIFEST),
      writeFile(resolve(directory, "extensions/CapCaptcha/includes/CapCaptcha.php"), CAP_CAPTCHA_CLASS),
      writeFile(
        resolve(directory, "extensions/CapCaptcha/includes/CapCaptchaAuthenticationRequest.php"),
        CAP_CAPTCHA_AUTHENTICATION_REQUEST,
      ),
      writeFile(resolve(directory, "extensions/CapCaptcha/includes/HTMLCapCaptchaField.php"), CAP_CAPTCHA_FIELD),
    ] : []),
  ]);

  return { directory, logoFilename };
}

export const templates = { renderCompose, renderEnvironment, renderInstaller, renderSettings };
 
