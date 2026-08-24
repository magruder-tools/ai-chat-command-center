import { describe, expect, it } from "vitest";
import { detectProjectFromUrl, isChatGptUrl } from "../src/shared/projects";

describe("native ChatGPT Project detection", () => {
  it("uses only a stable g-p URL segment", () => {
    expect(detectProjectFromUrl("https://chatgpt.com/g/g-p-abc_123/project"))
      .toEqual({ key: "g-p-abc_123", url: "https://chatgpt.com/g/g-p-abc_123/project" });
    expect(detectProjectFromUrl("https://chatgpt.com/g/g-p-abc_123/c/conversation"))
      .toEqual({ key: "g-p-abc_123", url: "https://chatgpt.com/g/g-p-abc_123/project" });
  });

  it("does not infer project membership from ordinary chat URLs or text-like slugs", () => {
    expect(detectProjectFromUrl("https://chatgpt.com/c/conversation-id")).toBeUndefined();
    expect(detectProjectFromUrl("https://chatgpt.com/projects/growth")).toBeUndefined();
  });

  it("rejects lookalike and non-HTTPS hosts", () => {
    expect(isChatGptUrl("https://chatgpt.com.evil.example/c/1")).toBe(false);
    expect(isChatGptUrl("http://chatgpt.com/c/1")).toBe(false);
  });
});
