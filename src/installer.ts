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

export async function installProject(_config: WikiConfig, directory: string): Promise<InstallResult> {
  if (!(await commandExists("docker", ["compose", "version"]))) {
    return { installed: false, reason: "Docker Compose was not found. Setup files are ready." };
  }

  await runDocker(directory, ["run", "--rm", "mediawiki-install"]);
  return { installed: true };
}

export const docker = { commandExists, runDocker };
 
