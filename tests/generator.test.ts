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
    extensions: ["VisualEditor", "Cite"], outputDirectory, installNow: false,
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
    const environment = await readFile(join(project.directory, ".env"), "utf8");

    expect(compose).toContain("mediawiki:1.46.0");
    expect(compose).toContain("mariadb:11.4");
    expect(settings).toContain("wfLoadExtension( 'VisualEditor' )");
    expect(settings).toContain("wiki-logo.svg");
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
    expect(templates.renderCompose(config("unused"))).toContain("${WIKI_PORT}:80");
  });
});
