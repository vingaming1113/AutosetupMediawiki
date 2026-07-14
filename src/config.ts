export const EXTENSIONS = [
  { value: "VisualEditor", label: "VisualEditor", hint: "Edit pages with a modern visual interface", recommended: true },
  { value: "WikiEditor", label: "WikiEditor", hint: "Add a helpful toolbar to source editing", recommended: true },
  { value: "Cite", label: "Cite", hint: "Add references and footnotes", recommended: true },
  { value: "ParserFunctions", label: "ParserFunctions", hint: "Use logic in templates", recommended: true },
  { value: "TemplateData", label: "TemplateData", hint: "Add structured information to templates", recommended: true },
  { value: "Scribunto", label: "Scribunto", hint: "Write powerful Lua modules", recommended: false },
  { value: "SyntaxHighlight_GeSHi", label: "SyntaxHighlight", hint: "Highlight source code on wiki pages", recommended: false },
  { value: "Nuke", label: "Nuke", hint: "Bulk-delete spam pages as an administrator", recommended: false },
] as const;

export type ExtensionName = (typeof EXTENSIONS)[number]["value"];

export const CAPTCHA_PROVIDERS = [
  {
    value: "cap",
    label: "Cap.js (recommended)",
    hint: "Private, self-hosted proof-of-work · github.com/tiagozip/cap",
    recommended: true,
  },
  { value: "none", label: "No CAPTCHA", hint: "You can add one later", recommended: false },
] as const;

export type CaptchaProvider = (typeof CAPTCHA_PROVIDERS)[number]["value"];

export type CaptchaConfig =
  | { provider: "cap"; serverUrl: string; siteKey: string; secretKey: string }
  | { provider: "none" };

export interface WikiConfig {
  wikiName: string;
  language: string;
  port: number;
  siteUrl: string;
  adminUser: string;
  adminPassword: string;
  databasePassword: string;
  logoPath?: string;
  extensions: ExtensionName[];
  captcha: CaptchaConfig;
  outputDirectory: string;
  installNow: boolean;
}

export function recommendedExtensions(): ExtensionName[] {
  return EXTENSIONS.filter((extension) => extension.recommended).map((extension) => extension.value);
}

export function validateCapServerUrl(value: string | undefined): string | undefined {
  try {
    const url = new URL(value?.trim() ?? "");
    if (!["http:", "https:"].includes(url.protocol)) throw new Error();
    if (url.username || url.password || url.search || url.hash) {
      return "Use a server URL without credentials, a query, or a fragment.";
    }
  } catch {
    return "Enter a full URL beginning with http:// or https://.";
  }
}

export function validateCapSiteKey(value: string | undefined): string | undefined {
  if (!value?.trim()) return "Please enter a value.";
  if (!/^[A-Za-z0-9_-]+$/.test(value.trim())) return "Use only letters, numbers, underscores, or hyphens.";
}

export function generatePassword(length = 24): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}







