import { describe, expect, test } from "bun:test";
import { generatePassword, recommendedExtensions } from "../src/config";

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
});
 
