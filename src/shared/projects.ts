import type { ProjectRecord } from "./types";
import { platformFromUrl } from "./platforms";

export interface DetectedProject {
  key: string;
  url: string;
}

const PROJECT_KEY = /^g-p-[A-Za-z0-9_-]+$/;

export function isChatGptUrl(url: string): boolean {
  return platformFromUrl(url) === "chatgpt";
}

export function detectProjectFromUrl(url: string): DetectedProject | undefined {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.hostname !== "chatgpt.com") return undefined;

    const parts = parsed.pathname.split("/").filter(Boolean);
    const key = parts.find((part) => PROJECT_KEY.test(part));
    if (!key) return undefined;

    return {
      key,
      url: `https://chatgpt.com/g/${encodeURIComponent(key)}/project`
    };
  } catch {
    return undefined;
  }
}

export function projectForKey(projects: ProjectRecord[], key?: string): ProjectRecord | undefined {
  return key ? projects.find((project) => project.key === key) : undefined;
}

export function mergeProject(projects: ProjectRecord[], project: ProjectRecord): ProjectRecord[] {
  const next = projects.filter((item) => item.key !== project.key);
  next.push(project);
  return next.sort((a, b) => a.name.localeCompare(b.name));
}
