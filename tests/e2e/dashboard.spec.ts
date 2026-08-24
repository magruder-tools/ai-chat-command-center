import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/?demo=1");
});

test("renders the focused three-section command center", async ({ page }) => {
  await expect(page.getByText("Command Center", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Working" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ready" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Later" })).toBeVisible();
  await expect(page.getByRole("button", { name: "New ChatGPT" })).toBeVisible();
  await expect(page.getByRole("button", { name: "New Claude" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Find Open Tabs/ })).toBeVisible();
});

test("keeps a throttled last-observed Ready chat in the Ready column", async ({ page }) => {
  const readyColumn = page.locator(".column-ready");
  await expect(readyColumn.getByRole("button", { name: "Open Q4 Budget Planning" })).toBeVisible();
  await expect(readyColumn.getByText(/Last checked/)).toBeVisible();
});

test("combines title and platform filters", async ({ page }) => {
  await page.getByRole("searchbox", { name: "Search chats" }).fill("Market Research");
  await expect(page.getByRole("button", { name: "Open Market Research Report" })).toBeVisible();
  await page.getByRole("button", { name: "ChatGPT", exact: true }).last().click();
  await expect(page.getByRole("button", { name: "Open Market Research Report" })).toHaveCount(0);
});

test("archive and restore keep lifecycle explicit", async ({ page }) => {
  await page.getByRole("button", { name: "Stop watching and close Market Research Report" }).click();
  await page.getByRole("button", { name: /Archive 2/ }).click();
  await expect(page.getByRole("heading", { name: "Archive" })).toBeVisible();
  await expect(page.locator(".archive-list").getByText("Market Research Report", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Restore" }).first().click();
  await expect(page.getByText("Restored and reopened")).toBeVisible();
});

test("adds and searches a note", async ({ page }) => {
  await page.getByRole("button", { name: "Edit note for Website Redesign Plan" }).click();
  await page.getByRole("textbox", { name: "Note" }).fill("Review this with the design team");
  await page.getByRole("button", { name: "Save note" }).click();
  await page.getByRole("searchbox", { name: "Search chats" }).fill("design team");
  await expect(page.getByRole("button", { name: "Open Website Redesign Plan" })).toBeVisible();
});

test("shows discovered ChatGPT and Claude tabs for review", async ({ page }) => {
  await page.getByRole("button", { name: /Find Open Tabs \(1\)/ }).click();
  await expect(page.getByRole("heading", { name: "Untracked AI chat tabs" })).toBeVisible();
  await expect(page.getByRole("dialog").getByText("Claude", { exact: true })).toBeVisible();
  await expect(page.getByText("Untracked strategy conversation")).toBeVisible();
});

test("slash focuses search and keyboard navigation exposes focus", async ({ page }) => {
  await page.keyboard.press("/");
  await expect(page.getByRole("searchbox", { name: "Search chats" })).toBeFocused();
  await page.keyboard.press("Escape");
  await page.locator("body").click({ position: { x: 900, y: 850 } });
  await page.keyboard.press("j");
  await expect(page.locator(".chat-open").first()).toBeFocused();
});
