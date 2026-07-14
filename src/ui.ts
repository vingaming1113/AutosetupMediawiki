import * as p from "@clack/prompts";
import chalk from "chalk";
import gradient from "gradient-string";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  CAPTCHA_PROVIDERS, EXTENSIONS, generatePassword, recommendedExtensions,
  validateCapServerUrl, validateCapSiteKey,
  type CaptchaConfig, type CaptchaProvider, type ExtensionName, type WikiConfig,
} from "./config";

const banner = [
  "███╗   ███╗███████╗██████╗ ██╗ █████╗ ██╗    ██╗██╗██╗  ██╗██╗",
  "████╗ ████║██╔════╝██╔══██╗██║██╔══██╗██║    ██║██║██║ ██╔╝██║",
  "██╔████╔██║█████╗  ██║  ██║██║███████║██║ █╗ ██║██║█████╔╝ ██║",
  "██║╚██╔╝██║██╔══╝  ██║  ██║██║██╔══██║██║███╗██║██║██╔═██╗ ██║",
  "██║ ╚═╝ ██║███████╗██████╔╝██║██║  ██║╚███╔███╔╝██║██║  ██╗██║",
  "╚═╝     ╚═╝╚══════╝╚═════╝ ╚═╝╚═╝  ╚═╝ ╚══╝╚══╝ ╚═╝╚═╝  ╚═╝╚═╝",
  "                      A U T O S E T U P",
].join("\n");

function quitIfCancelled<T>(value: T | symbol): T {
  if (p.isCancel(value)) {
    p.cancel("Setup cancelled. Nothing was changed.");
    process.exit(0);
  }
  return value;
}

function required(value: string | undefined): string | undefined {
  if (!value?.trim()) return "Please enter a value.";
}

export function showBanner(): void {
  console.clear();
  console.log(gradient(["#22d3ee", "#8b5cf6", "#fb7185"]).multiline(banner));
  console.log(chalk.dim("\n  A friendly wizard for your own corner of the internet.\n"));
}

export async function promptForConfig(): Promise<WikiConfig> {
  showBanner();
  p.intro(chalk.bgHex("#7c3aed").white.bold(" CREATE YOUR WIKI "));

  const wikiName = quitIfCancelled(await p.text({
    message: "What should your wiki be called?", placeholder: "My Community Wiki", validate: required,
  })).trim();

  const language = quitIfCancelled(await p.select({
    message: "Choose the wiki language", initialValue: "en",
    options: [
      { value: "en", label: "English" }, { value: "da", label: "Dansk" },
      { value: "de", label: "Deutsch" }, { value: "es", label: "Español" },
      { value: "fr", label: "Français" }, { value: "nl", label: "Nederlands" },
      { value: "no", label: "Norsk" }, { value: "sv", label: "Svenska" },
    ],
  }));

  const portText = quitIfCancelled(await p.text({
    message: "Which local port should MediaWiki use?", initialValue: "8080",
    validate(value) {
      const port = Number(value);
      if (!Number.isInteger(port) || port < 1 || port > 65535) return "Enter a port between 1 and 65535.";
    },
  }));
  const port = Number(portText);

  const siteUrl = quitIfCancelled(await p.text({
    message: "What URL will people use?", initialValue: `http://localhost:${port}`,
    validate(value) {
      try {
        const url = new URL(value ?? "");
        if (!["http:", "https:"].includes(url.protocol)) throw new Error();
      } catch { return "Enter a full URL beginning with http:// or https://."; }
    },
  })).replace(/\/$/, "");

  const logoPathInput = (quitIfCancelled(await p.text({
    message: "Logo image path (optional)", placeholder: "./my-logo.png — press Enter to skip",
    validate(value) {
      if (value?.trim() && !existsSync(resolve(value.trim()))) return "That file does not exist. Check the path or leave it blank.";
    },
  })) ?? "").trim();

  const extensions = quitIfCancelled(await p.multiselect<ExtensionName>({
    message: "Choose extensions (Space toggles, Enter confirms)", initialValues: recommendedExtensions(), required: false,
    options: EXTENSIONS.map((item) => ({ value: item.value, label: item.label, hint: item.hint })),
  }));

  const captchaProvider = quitIfCancelled(await p.select<CaptchaProvider>({
    message: "Protect your wiki with a CAPTCHA?",
    initialValue: "cap",
    options: CAPTCHA_PROVIDERS.map(({ value, label, hint }) => ({ value, label, hint })),
  }));

  let captcha: CaptchaConfig = { provider: "none" };
  if (captchaProvider === "cap") {
    const serverUrl = quitIfCancelled(await p.text({
      message: "Public URL of your Cap Standalone server",
      placeholder: "https://cap.example.com",
      validate: validateCapServerUrl,
    })).trim().replace(/\/+$/, "");
    const siteKey = quitIfCancelled(await p.text({
      message: "Cap site key", validate: validateCapSiteKey,
    })).trim();
    const secretKey = quitIfCancelled(await p.password({
      message: "Cap secret key", mask: "•", validate: required,
    }));
    captcha = { provider: "cap", serverUrl, siteKey, secretKey };
  } else if (captchaProvider !== "none") {
    const providerLabel = CAPTCHA_PROVIDERS.find(({ value }) => value === captchaProvider)?.label
      ?? captchaProvider;
    const siteKey = quitIfCancelled(await p.text({
      message: `${providerLabel} site key`, validate: required,
    })).trim();
    const secretKey = quitIfCancelled(await p.password({
      message: `${providerLabel} secret key`, mask: "•", validate: required,
    }));
    captcha = { provider: captchaProvider, siteKey, secretKey };
  }

  const adminUser = quitIfCancelled(await p.text({
    message: "Administrator username", initialValue: "WikiAdmin", validate: required,
  })).trim();

  const adminPassword = quitIfCancelled(await p.password({
    message: "Administrator password", mask: "•",
    validate(value) { if (!value || value.length < 10) return "Use at least 10 characters."; },
  }));

  const outputDirectory = quitIfCancelled(await p.text({
    message: "Where should setup files be created?", initialValue: "./mediawiki-setup", validate: required,
  })).trim();

  const installNow = quitIfCancelled(await p.confirm({
    message: "Start the wiki with Docker after creating the files?", initialValue: true,
  }));

  return {
    wikiName, language, port, siteUrl, adminUser, adminPassword,
    databasePassword: generatePassword(), logoPath: logoPathInput || undefined,
    extensions, captcha, outputDirectory, installNow,
  };
}
 
