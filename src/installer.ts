import type { WikiConfig } from "./config";

export interface InstallResult { installed: boolean; reason?: string }

async function commandExists(command: string, args: string[]): Promise<boolean> {
  try {
    const process = Bun.spawn([command, ...args], { stdout: "ignore", stderr: "ignore" });
    return (await process.exited) === 0;
  } catch { return false; }
}

async function runDocker(directory: string, args: string[]): Promise<string> {
  const process = Bun.spawn(["docker", "compose", ...args], { cwd: directory, stdout: "pipe", stderr: "pipe" });
  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited, new Response(process.stdout).text(), new Response(process.stderr).text(),
  ]);
  if (exitCode !== 0) throw new Error(stderr.trim() || `Docker Compose failed (${args[0]}).`);
  return stdout.trim();
}

async function waitForMediaWiki(directory: string): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt++) {
    const running = await runDocker(directory, ["ps", "--status", "running", "--services"]);
    if (running.split("\n").includes("mediawiki")) return;
    await Bun.sleep(2_000);
  }
  throw new Error("MediaWiki did not become ready within two minutes. Run docker compose logs for details.");
}

export async function installProject(config: WikiConfig, directory: string): Promise<InstallResult> {
  if (!config.installNow) return { installed: false, reason: "Installation was skipped." };
  if (!(await commandExists("docker", ["compose", "version"]))) {
    return { installed: false, reason: "Docker Compose was not found. Setup files are ready." };
  }

  await runDocker(directory, ["up", "-d", "database", "mediawiki"]);
  await waitForMediaWiki(directory);
  const url = new URL(config.siteUrl);
  const scriptPath = url.pathname === "/" ? "" : url.pathname.replace(/\/$/, "");
  await runDocker(directory, [
    "exec", "-T", "mediawiki", "php", "maintenance/run.php", "install",
    `--server=${url.origin}`, `--scriptpath=${scriptPath}`, "--dbtype=mysql", "--dbserver=database",
    "--dbname=mediawiki", "--dbuser=mediawiki", `--dbpass=${config.databasePassword}`,
    `--lang=${config.language}`, `--pass=${config.adminPassword}`, config.wikiName, config.adminUser,
  ]);
  await runDocker(directory, [
    "exec", "-T", "mediawiki", "php", "-r",
    "file_put_contents('/var/www/html/LocalSettings.php', \"\\nrequire_once '/var/www/html/LocalSettings.autosetup.php';\\n\", FILE_APPEND);",
  ]);
  return { installed: true };
}

export const docker = { commandExists, runDocker };
 
