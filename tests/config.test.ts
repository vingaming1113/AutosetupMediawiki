import { describe, expect, test } from "bun:test";
import {
  CAPTCHA_PROVIDERS,
  generatePassword,
  recommendedExtensions,
  validateCapServerUrl,
  validateCapSiteKey,
} from "../src/config";

describe("configuration helpers", () => {
  test("generates passwords at the requested length", () => {
    const first = generatePassword(32);
    const second = generatePassword(32);
    expect(first).toHaveLength(32);
    expect(second).toHaveLength(32);
    expect(first).not.toBe(second);
  });

  test("provides a useful default extension set", () => {
    expect(recommendedExtensions()).toEqual([
      "VisualEditor", "WikiEditor", "Cite", "ParserFunctions", "TemplateData",
    ]);
  });

  test("puts the recommended Cap provider first", () => {
    expect(CAPTCHA_PROVIDERS[0]).toMatchObject({ value: "cap", recommended: true });
  });

  test("validates Cap server URLs and site keys", () => {
    expect(validateCapServerUrl("https://cap.example.com/base/")).toBeUndefined();
    expect(validateCapServerUrl("javascript:alert(1)")).toContain("http");
    expect(validateCapServerUrl("https://user:secret@cap.example.com")).toContain("without credentials");
    expect(validateCapServerUrl("https://cap.example.com?secret=value")).toContain("without credentials");
    expect(validateCapSiteKey("d9256640cb53")).toBeUndefined();
    expect(validateCapSiteKey("../../wrong")).toContain("letters");
  });
});
 
