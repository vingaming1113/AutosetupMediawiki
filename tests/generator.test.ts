import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WikiConfig } from "../src/config";
import { generateProject, templates } from "../src/generator";
import { installProject } from "../src/installer";

const temporaryDirectories: string[] = [];
afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

function config(outputDirectory: string): WikiConfig {
  return {
    wikiName: "Test $ Wiki", language: "en", port: 8080,
    siteUrl: "http://localhost:8080", adminUser: "WikiAdmin",
    adminPassword: "safe$password", databasePassword: "db$password",
    extensions: ["VisualEditor", "Cite"], captcha: { provider: "none" },
    outputDirectory, installNow: false,
  };
}

describe("project generator", () => {
  test("creates a complete, private project with logo and extensions", async () => {
    const root = await mkdtemp(join(tmpdir(), "mediawiki-autosetup-"));
    temporaryDirectories.push(root);
    const logo = join(root, "brand.svg");
    await writeFile(logo, "<svg xmlns='http://www.w3.org/2000/svg'/>");
    const target = join(root, "wiki");
    const input = { ...config(target), logoPath: logo };

    const project = await generateProject(input);
    const compose = await readFile(join(project.directory, "compose.yml"), "utf8");
    const settings = await readFile(join(project.directory, "LocalSettings.autosetup.php"), "utf8");
    const installer = await readFile(join(project.directory, "install.php"), "utf8");
    const environment = await readFile(join(project.directory, ".env"), "utf8");

    expect(compose).toContain("mediawiki:1.46.0");
    expect(compose).toContain("mariadb:11.4");
    expect(settings).toContain("wfLoadExtension( 'VisualEditor' )");
    expect(settings).toContain("wiki-logo.svg");
    expect(installer).toContain("maintenance/run.php', 'install'");
    expect(installer).toContain("--passfile=");
    expect(installer).toContain("--dbpassfile=");
    expect(installer).toContain("1 => STDOUT");
    expect(installer).toContain("2 => STDERR");
    expect(installer).not.toContain("/dev/stdout");
    expect(installer).not.toContain("/dev/stderr");
    expect(installer).not.toContain(input.adminPassword);
    expect(installer).not.toContain(input.databasePassword);
    expect(environment).toMatch(/^COMPOSE_PROJECT_NAME='mediawiki-autosetup-[a-f0-9]{12}'$/m);
    expect(environment).toContain("WIKI_NAME='Test $ Wiki'");
    expect(environment).toContain("DATABASE_PASSWORD='db$password'");
    expect((await stat(join(project.directory, ".env"))).mode & 0o777).toBe(0o600);
    expect(await readFile(join(project.directory, "data/images/wiki-logo.svg"), "utf8")).toContain("<svg");
  });

  test("refuses to overwrite an existing directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "mediawiki-autosetup-"));
    temporaryDirectories.push(root);
    await writeFile(join(root, "keep.txt"), "important");
    expect(generateProject(config(root))).rejects.toThrow("not empty");
  });

  test("keeps generated-only installs usable without Docker", async () => {
    const result = await installProject(config("unused"), "unused");
    expect(result.installed).toBeFalse();
    expect(result.reason).toContain("skipped");
  });

  test("renders the selected port", () => {
    const compose = templates.renderCompose(config("unused"));
    expect(compose).toContain("${WIKI_PORT}:80");
    expect(compose).not.toContain("CapCaptcha");
  });

  test("installs MediaWiki before starting the web service", () => {
    const compose = templates.renderCompose(config("unused"));
    const parsed = Bun.YAML.parse(compose) as {
      services: {
        "mediawiki-install": {
          command: string[];
          environment: Record<string, string>;
          volumes: string[];
        };
        mediawiki: { depends_on: Record<string, { condition: string }> };
      };
    };
    const installService = parsed.services["mediawiki-install"];

    expect(installService.command).toEqual(["php", "/autosetup/install.php"]);
    expect(installService.environment.WIKI_ADMIN_PASSWORD).toBe("${WIKI_ADMIN_PASSWORD}");
    expect(installService.environment.DATABASE_PASSWORD).toBe("${DATABASE_PASSWORD}");
    expect(installService.volumes).toContain("./install.php:/autosetup/install.php:ro");
    expect(parsed.services.mediawiki.depends_on["mediawiki-install"]?.condition)
      .toBe("service_completed_successfully");
  });

  test("generates a server-validated Cap adapter without leaking its secret", async () => {
    const root = await mkdtemp(join(tmpdir(), "mediawiki-autosetup-cap-"));
    temporaryDirectories.push(root);
    const secretKey = "cap-secret-never-publish";
    const input: WikiConfig = {
      ...config(join(root, "wiki")),
      captcha: {
        provider: "cap",
        deployment: "existing",
        serverUrl: "https://cap.example.com",
        siteKey: "d9256640cb53",
        secretKey,
      },
    };

    const project = await generateProject(input);
    const compose = await readFile(join(project.directory, "compose.yml"), "utf8");
    const environment = await readFile(join(project.directory, ".env"), "utf8");
    const settings = await readFile(join(project.directory, "LocalSettings.autosetup.php"), "utf8");
    const generatedReadme = await readFile(join(project.directory, "README.md"), "utf8");
    const manifestText = await readFile(
      join(project.directory, "extensions/CapCaptcha/extension.json"), "utf8",
    );
    const adapter = await readFile(
      join(project.directory, "extensions/CapCaptcha/includes/CapCaptcha.php"), "utf8",
    );
    const authentication = await readFile(
      join(project.directory, "extensions/CapCaptcha/includes/CapCaptchaAuthenticationRequest.php"), "utf8",
    );
    const field = await readFile(
      join(project.directory, "extensions/CapCaptcha/includes/HTMLCapCaptchaField.php"), "utf8",
    );
    const parsedCompose = Bun.YAML.parse(compose) as {
      services: { mediawiki: { environment: Record<string, string>; volumes: string[] } };
    };
    const manifest = JSON.parse(manifestText) as Record<string, unknown>;

    expect(compose).toContain("./extensions/CapCaptcha:/var/www/html/extensions/CapCaptcha:ro");
    expect(compose).not.toContain("tiago2/cap");
    expect(compose).not.toContain("cap-valkey");
    expect(compose).toContain("CAP_CAPTCHA_SECRET_KEY: ${CAP_CAPTCHA_SECRET_KEY}");
    expect(parsedCompose.services.mediawiki.environment.CAP_CAPTCHA_SITE_KEY).toBe("${CAP_CAPTCHA_SITE_KEY}");
    expect(parsedCompose.services.mediawiki.volumes).toContain(
      "./extensions/CapCaptcha:/var/www/html/extensions/CapCaptcha:ro",
    );
    expect(environment).toContain(`CAP_CAPTCHA_SECRET_KEY='${secretKey}'`);
    expect(settings).toContain("MediaWiki\\Extension\\CapCaptcha\\CapCaptcha::class");
    expect(settings).not.toContain("ReCaptchaNoCaptcha");
    expect(adapter).toContain("siteverify");
    expect(adapter).toContain("getVerificationEndpoint");
    expect(adapter).toContain("'type' => 'module'");
    expect(authentication).toContain("class CapCaptchaAuthenticationRequest");
    expect(field).toContain("data-cap-hidden-field-name");
    expect(manifest["license-name"]).toBe("MIT");
    expect(generatedReadme).toContain("WIDGET_VERSION=0.1.56");
    await expect(stat(join(project.directory, "cap-init.ts"))).rejects.toThrow();
    for (const publicFile of [compose, settings, generatedReadme, manifestText, adapter, authentication, field]) {
      expect(publicFile).not.toContain(secretKey);
    }
  });

  test("automatically provisions a private Cap server and site key", async () => {
    const root = await mkdtemp(join(tmpdir(), "mediawiki-autosetup-cap-auto-"));
    temporaryDirectories.push(root);
    const adminKey = "cap-admin-secret-never-publish";
    const project = await generateProject({
      ...config(join(root, "wiki")),
      siteUrl: "https://wiki.example.com/community",
      captcha: {
        provider: "cap",
        deployment: "automatic",
        serverUrl: "https://cap.example.com",
        port: 3000,
        adminKey,
      },
    });
    const compose = await readFile(join(project.directory, "compose.yml"), "utf8");
    const environment = await readFile(join(project.directory, ".env"), "utf8");
    const settings = await readFile(join(project.directory, "LocalSettings.autosetup.php"), "utf8");
    const initScript = await readFile(join(project.directory, "cap-init.ts"), "utf8");
    const generatedReadme = await readFile(join(project.directory, "README.md"), "utf8");
    const parsedCompose = Bun.YAML.parse(compose) as {
      services: {
        cap: {
          image: string;
          ports: string[];
          environment: Record<string, string>;
          depends_on: Record<string, { condition: string }>;
        };
        "cap-valkey": { image: string; volumes: string[] };
        "cap-init": { image: string; environment: Record<string, string>; volumes: string[] };
        mediawiki: {
          environment: Record<string, string>;
          depends_on: Record<string, { condition: string }>;
          volumes: string[];
        };
      };
      volumes: Record<string, unknown>;
    };

    expect(parsedCompose.services.cap.image).toBe("tiago2/cap:3.1.5");
    expect(parsedCompose.services["cap-init"].image).toBe("tiago2/cap:3.1.5");
    expect(parsedCompose.services["cap-valkey"].image).toBe("valkey/valkey:9.0.4-alpine");
    expect(parsedCompose.services.cap.ports).toContain("${CAP_STANDALONE_PORT}:3000");
    expect(parsedCompose.services.cap.environment.ADMIN_KEY).toBe("${CAP_STANDALONE_ADMIN_KEY}");
    expect(parsedCompose.services.cap.environment.WIDGET_VERSION).toBe("0.1.56");
    expect(parsedCompose.services.cap.environment.WASM_VERSION).toBe("0.0.7");
    expect(parsedCompose.services.mediawiki.environment.CAP_CAPTCHA_SERVER_URL)
      .toBe("${CAP_CAPTCHA_SERVER_URL}");
    expect(parsedCompose.services.mediawiki.environment.CAP_STANDALONE_ADMIN_KEY).toBeUndefined();
    expect(parsedCompose.services.mediawiki.depends_on["cap-init"]?.condition)
      .toBe("service_completed_successfully");
    expect(parsedCompose.services.mediawiki.volumes).toContain("cap-credentials:/run/cap:ro");
    expect(parsedCompose.services["cap-init"].volumes).toContain("cap-credentials:/cap-data");
    expect(parsedCompose.volumes["cap-valkey-data"]).toBeDefined();
    expect(parsedCompose.volumes["cap-credentials"]).toBeDefined();
    expect(environment).toContain("CAP_STANDALONE_PORT='3000'");
    expect(environment).toContain(`CAP_STANDALONE_ADMIN_KEY='${adminKey}'`);
    expect(environment).toContain("WIKI_ORIGIN='https://wiki.example.com'");
    expect(settings).toContain("file_get_contents( '/run/cap/credentials.json' )");
    expect(settings).toContain("$wgCapCaptchaInternalServerUrl = 'http://cap:3000';");
    expect(settings).not.toContain("getenv( 'CAP_CAPTCHA_SITE_KEY' )");
    expect(initScript).toContain('"/auth/login"');
    expect(initScript).toContain('"/server/keys"');
    expect(initScript).toContain("instrumentation: true");
    expect(initScript).toContain('corsOrigins: [new URL(requiredEnvironment("WIKI_URL")).origin]');
    expect(initScript).toContain("chmod(credentialsPath, 0o444)");
    expect(generatedReadme).toContain("automatically runs Cap Standalone");
    await expect(stat(join(project.directory, "data/cap"))).rejects.toThrow();
    for (const publicFile of [compose, settings, initScript, generatedReadme]) {
      expect(publicFile).not.toContain(adminKey);
    }
  });

  test("configures bundled managed CAPTCHA providers without leaking their secrets", async () => {
    const providers = [
      {
        provider: "turnstile" as const,
        label: "Cloudflare Turnstile",
        extension: "ConfirmEdit/Turnstile",
        className: "MediaWiki\\Extension\\ConfirmEdit\\Turnstile\\Turnstile::class",
        siteVariable: "TURNSTILE_SITE_KEY",
        secretVariable: "TURNSTILE_SECRET_KEY",
        remoteIpSetting: "$wgTurnstileSendRemoteIP = false;",
      },
      {
        provider: "hcaptcha" as const,
        label: "hCaptcha",
        extension: "ConfirmEdit/hCaptcha",
        className: "MediaWiki\\Extension\\ConfirmEdit\\hCaptcha\\HCaptcha::class",
        siteVariable: "HCAPTCHA_SITE_KEY",
        secretVariable: "HCAPTCHA_SECRET_KEY",
        remoteIpSetting: "$wgHCaptchaSendRemoteIP = false;",
      },
      {
        provider: "recaptcha" as const,
        label: "Google reCAPTCHA v2",
        extension: "ConfirmEdit/ReCaptchaNoCaptcha",
        className: "MediaWiki\\Extension\\ConfirmEdit\\ReCaptchaNoCaptcha\\ReCaptchaNoCaptcha::class",
        siteVariable: "RECAPTCHA_SITE_KEY",
        secretVariable: "RECAPTCHA_SECRET_KEY",
        remoteIpSetting: "$wgReCaptchaSendRemoteIP = false;",
      },
    ];

    for (const provider of providers) {
      const root = await mkdtemp(join(tmpdir(), `mediawiki-autosetup-${provider.provider}-`));
      temporaryDirectories.push(root);
      const secretKey = `${provider.provider}-secret-never-publish`;
      const project = await generateProject({
        ...config(join(root, "wiki")),
        captcha: { provider: provider.provider, siteKey: "public-site-key", secretKey },
      });
      const compose = await readFile(join(project.directory, "compose.yml"), "utf8");
      const environment = await readFile(join(project.directory, ".env"), "utf8");
      const settings = await readFile(join(project.directory, "LocalSettings.autosetup.php"), "utf8");
      const generatedReadme = await readFile(join(project.directory, "README.md"), "utf8");
      const parsedCompose = Bun.YAML.parse(compose) as {
        services: { mediawiki: { environment: Record<string, string> } };
      };

      expect(parsedCompose.services.mediawiki.environment[provider.siteVariable])
        .toBe(`\${${provider.siteVariable}}`);
      expect(environment).toContain(`${provider.secretVariable}='${secretKey}'`);
      expect(settings).toContain(`'${provider.extension}'`);
      expect(settings).toContain(provider.className);
      expect(settings).toContain(provider.remoteIpSetting);
      expect(settings).toContain("$wgCaptchaTriggers['createaccount'] = true;");
      expect(generatedReadme).toContain(provider.label);
      await expect(stat(join(project.directory, "extensions/CapCaptcha"))).rejects.toThrow();
      for (const publicFile of [compose, settings, generatedReadme]) {
        expect(publicFile).not.toContain(secretKey);
      }
    }
  });
});
