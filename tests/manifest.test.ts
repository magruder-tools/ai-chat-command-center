import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const manifest = JSON.parse(readFileSync(new URL("../public/manifest.json", import.meta.url), "utf8"));

describe("Manifest V3 security", () => {
  it("uses MV3 and only the two supported chat hosts", () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.host_permissions).toEqual(["https://chatgpt.com/*", "https://claude.ai/*"]);
  });

  it("requests none of the prohibited permissions", () => {
    for (const permission of ["notifications", "cookies", "webRequest", "debugger"]) {
      expect(manifest.permissions).not.toContain(permission);
    }
  });

  it("can repair the passive observer in already-open supported chat tabs", () => {
    expect(manifest.permissions).toContain("scripting");
  });

  it("keeps a strict extension CSP and no remote code", () => {
    expect(manifest.content_security_policy.extension_pages).toBe("script-src 'self'; object-src 'none'; base-uri 'none'; frame-src 'none'");
  });
});
