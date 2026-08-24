// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { detectObservedStatus } from "../src/content/observer";

describe("passive observer", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("detects Working from a visible stop control", () => {
    document.body.innerHTML = '<button data-testid="stop-button">Stop</button><div id="prompt-textarea"></div>';
    expect(detectObservedStatus()).toEqual({ status: "working", reason: "visible-running-control" });
  });

  it("keeps a ChatGPT Pro stream Working when no stop control is exposed", () => {
    document.body.innerHTML = '<main data-scroll-root data-stream-active><form data-type="unified-composer"></form></main>';
    expect(detectObservedStatus()).toEqual({ status: "working", reason: "visible-running-control" });
  });

  it("moves a ChatGPT Pro stream to Ready when its stream-active marker disappears", () => {
    document.body.innerHTML = '<main data-scroll-root data-stream-active><form data-type="unified-composer"></form></main>';
    document.querySelector("[data-scroll-root]")?.removeAttribute("data-stream-active");
    expect(detectObservedStatus()).toEqual({ status: "ready", reason: "composer-available" });
  });

  it("moves Working to Ready when the running control disappears", () => {
    document.body.innerHTML = '<button aria-label="Stop generating"></button><div id="prompt-textarea"></div>';
    expect(detectObservedStatus().status).toBe("working");
    document.querySelector("button")?.remove();
    expect(detectObservedStatus()).toEqual({ status: "ready", reason: "composer-available" });
  });

  it.each(["completed response", "natural-language question", "approval", "confirmation", "form", "other user input"])(
    "keeps %s in Ready because no semantic content classification exists",
    () => {
      document.body.innerHTML = '<div id="prompt-textarea" contenteditable="true"></div>';
      expect(detectObservedStatus().status).toBe("ready");
    }
  );

  it("fails safely to Unknown when expected landmarks disappear", () => {
    document.body.innerHTML = '<main data-unrecognized-ui="true"></main>';
    expect(detectObservedStatus()).toEqual({ status: "unknown", reason: "expected-landmarks-absent" });
  });

  it("ignores hidden running controls", () => {
    document.body.innerHTML = '<button data-testid="stop-button" hidden></button><div id="prompt-textarea"></div>';
    expect(detectObservedStatus().status).toBe("ready");
  });

  it("detects Claude Working from its visible stop control", () => {
    document.body.innerHTML = '<button data-testid="chat-input-stop" aria-label="Stop response"></button><div data-testid="chat-input" contenteditable="true"></div>';
    expect(detectObservedStatus()).toEqual({ status: "working", reason: "visible-running-control" });
  });

  it("detects Claude Ready from its composer landmark", () => {
    document.body.innerHTML = '<div data-testid="chat-input" contenteditable="true" aria-label="Write your prompt to Claude"></div>';
    expect(detectObservedStatus()).toEqual({ status: "ready", reason: "composer-available" });
  });
});
