import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { matchesFilters, sortChats, workflowSection } from "../shared/model";
import { relativeTime, snoozeLabel } from "../shared/time";
import type {
  AppSnapshot,
  CandidateTab,
  ChatPlatform,
  DashboardFilters,
  ImportPayload,
  ProjectRecord,
  TrackedChat,
  WorkflowSection
} from "../shared/types";
import { dashboardActions, subscribeToState } from "./service";

const initialFilters: DashboardFilters = {
  query: "",
  platform: "all",
  project: "all",
  flaggedOnly: false,
  unreadOnly: false
};

type Modal = "candidate" | "discovery" | "note" | "settings" | "observer-safety" | null;

function AppMark() {
  return (
    <span className="app-mark" aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}

function ActionIcon({ name }: { name: "flag" | "unread" | "note" | "stop" }) {
  const paths = {
    flag: <path d="M6 21V4m0 1h10l-2 4 2 4H6" />,
    unread: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 7 8 6 8-6" /></>,
    note: <><path d="M5 3h11l3 3v15H5z" /><path d="M15 3v4h4M8 11h8M8 15h8" /></>,
    stop: <><circle cx="12" cy="12" r="9" /><path d="m9 9 6 6m0-6-6 6" /></>
  }[name];
  return <svg className="action-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths}</svg>;
}

function PlatformIcon({ platform }: { platform: ChatPlatform }) {
  if (platform === "claude") {
    return (
      <svg className="platform-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2.8v18.4M4.03 7.4l15.94 9.2M4.03 16.6l15.94-9.2M2.8 12h18.4" />
      </svg>
    );
  }
  return (
    <svg className="platform-icon" viewBox="0 0 24 24" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="1.65">
        <circle cx="12" cy="7" r="4.15" />
        <circle cx="16.35" cy="9.5" r="4.15" />
        <circle cx="16.35" cy="14.5" r="4.15" />
        <circle cx="12" cy="17" r="4.15" />
        <circle cx="7.65" cy="14.5" r="4.15" />
        <circle cx="7.65" cy="9.5" r="4.15" />
      </g>
    </svg>
  );
}

function PlatformBadge({ platform, compact = false }: { platform: ChatPlatform; compact?: boolean }) {
  return (
    <span className={`platform-badge platform-${platform}${compact ? " compact" : ""}`}>
      <PlatformIcon platform={platform} />
      {!compact && <span>{platform === "chatgpt" ? "ChatGPT" : "Claude"}</span>}
    </span>
  );
}

function SectionIcon({ section }: { section: WorkflowSection }) {
  const symbols: Record<WorkflowSection, string> = {
    working: "↗",
    ready: "✓",
    later: "◷",
    unknown: "?",
    archive: "□"
  };
  return <span className={`section-icon section-icon-${section}`} aria-hidden="true">{symbols[section]}</span>;
}

function EmptyColumn({ section }: { section: "working" | "ready" | "later" }) {
  const copy = {
    working: ["Nothing running", "Chats appear here while ChatGPT or Claude is actively working."],
    ready: ["Inbox clear", "Finished work and chats waiting for input land here."],
    later: ["Nothing snoozed", "Snooze a chat to keep it tracked but out of the way."]
  }[section];
  return (
    <div className="empty-column">
      <span className="empty-dot" />
      <strong>{copy[0]}</strong>
      <p>{copy[1]}</p>
    </div>
  );
}

interface ChatCardProps {
  chat: TrackedChat;
  snapshot: AppSnapshot;
  section: WorkflowSection;
  returning: boolean;
  opening: boolean;
  onOpen: (chat: TrackedChat) => void;
  onAction: (action: () => Promise<unknown>, success?: string) => void;
  onArchived: (chat: TrackedChat) => void;
  onEditNote: (chat: TrackedChat) => void;
}

function ChatCard({ chat, snapshot, section, returning, opening, onOpen, onAction, onArchived, onEditNote }: ChatCardProps) {
  const runtime = snapshot.runtimes[chat.id];
  const projectName = chat.projectName || "No project";
  const pausedByChrome = runtime?.reason === "tab-discarded" || runtime?.reason === "tab-frozen";
  const detail = section === "later"
    ? snoozeLabel(chat.snoozedUntil)
    : pausedByChrome
      ? `Paused by Chrome${runtime?.lastSeenAt ? ` · ${relativeTime(runtime.lastSeenAt)}` : ""}`
      : runtime?.reason === "ready-last-observed" && runtime.lastSeenAt
        ? `Last checked ${relativeTime(runtime.lastSeenAt)}`
        : runtime?.lastSeenAt
      ? relativeTime(runtime.lastSeenAt)
      : runtime?.reason?.replaceAll("-", " ") || "Not open on this device";

  const changeProject = (key: string) => {
    const project = snapshot.projects.find((item) => item.key === key);
    onAction(() => dashboardActions.setFields(chat.id, project
      ? { projectKey: project.key, projectName: project.name, projectUrl: project.url }
      : { projectKey: "", projectName: undefined, projectUrl: undefined }), "Project updated");
  };

  return (
    <article
      className={`chat-card status-${section}${returning ? " is-returning" : ""}${opening ? " is-opening" : ""}`}
      data-chat-card
      data-chat-id={chat.id}
    >
      <button className="chat-open" onClick={() => onOpen(chat)} aria-label={`Open ${chat.title} on ${chat.platform === "chatgpt" ? "ChatGPT" : "Claude"}`}>
        <span className="status-rail" aria-hidden="true" />
        <span className="chat-title-line">
          {chat.unread && <span className="unread-dot" aria-label="Unread" />}
          <strong>{chat.title}</strong>
          {chat.flagged && <span className="flag-indicator" aria-label="Flagged">◆</span>}
        </span>
        <span className="chat-meta-line">
          <PlatformBadge platform={chat.platform} />
          {chat.platform === "chatgpt" && <span className="project-label">{projectName}</span>}
          <span aria-hidden="true">·</span>
          <span>{detail}</span>
        </span>
        {chat.note && <span className="chat-note-preview">{chat.note}</span>}
      </button>

      <div className="chat-actions" aria-label={`Actions for ${chat.title}`}>
        <button
          className={`icon-button${chat.flagged ? " is-active" : ""}`}
          title={chat.flagged ? "Remove flag" : "Flag"}
          aria-label={chat.flagged ? "Remove flag" : "Flag"}
          onClick={() => onAction(() => dashboardActions.setFields(chat.id, { flagged: !chat.flagged }))}
        ><ActionIcon name="flag" /></button>
        <button
          className={`icon-button${chat.unread ? " is-active" : ""}`}
          title={chat.unread ? "Mark read" : "Mark unread"}
          aria-label={chat.unread ? "Mark read" : "Mark unread"}
          onClick={() => onAction(() => dashboardActions.setFields(chat.id, { unread: !chat.unread }))}
        ><ActionIcon name="unread" /></button>
        <button className={`icon-button${chat.note ? " is-active" : ""}`} title="Edit note" aria-label={`Edit note for ${chat.title}`} onClick={() => onEditNote(chat)}>
          <ActionIcon name="note" />
        </button>
        {chat.platform === "chatgpt" && (
          <label className="compact-select" title="Choose native ChatGPT Project">
            <span className="sr-only">Choose project for {chat.title}</span>
            <select value={chat.projectKey || ""} onChange={(event) => changeProject(event.target.value)}>
              <option value="">No project</option>
              {snapshot.projects.map((project) => <option key={project.key} value={project.key}>{project.name}</option>)}
            </select>
          </label>
        )}
        <label className="compact-select snooze-select" title="Snooze">
          <span className="sr-only">Snooze {chat.title}</span>
          <select
            value=""
            aria-label={`Snooze ${chat.title}`}
            onChange={(event) => {
              const duration = Number(event.target.value);
              if (duration) onAction(() => dashboardActions.snooze(chat.id, Date.now() + duration), "Moved to Later");
              event.target.value = "";
            }}
          >
            <option value="">Snooze</option>
            <option value={60 * 60 * 1000}>1 hour</option>
            <option value={24 * 60 * 60 * 1000}>Tomorrow</option>
            <option value={7 * 24 * 60 * 60 * 1000}>1 week</option>
          </select>
        </label>
        <button
          className="icon-button"
          title="Stop watching and close"
          aria-label={`Stop watching and close ${chat.title}`}
          onClick={() => {
            onArchived(chat);
            onAction(() => dashboardActions.archive(chat.id), "Stopped watching and moved to Archive");
          }}
        ><ActionIcon name="stop" /></button>
      </div>
    </article>
  );
}

function WorkflowColumn({
  section,
  chats,
  snapshot,
  returningId,
  openingId,
  onOpen,
  onAction,
  onArchived,
  onEditNote
}: {
  section: "working" | "ready" | "later";
  chats: TrackedChat[];
  snapshot: AppSnapshot;
  returningId?: string;
  openingId?: string;
  onOpen: (chat: TrackedChat) => void;
  onAction: ChatCardProps["onAction"];
  onArchived: (chat: TrackedChat) => void;
  onEditNote: (chat: TrackedChat) => void;
}) {
  const sectionCopy = {
    working: ["Working", "Actively processing"],
    ready: ["Ready", "Your inbox"],
    later: ["Later", "Snoozed, still watched"]
  }[section];
  return (
    <section className={`workflow-column column-${section}`} aria-labelledby={`${section}-heading`}>
      <header className="column-header">
        <div>
          <SectionIcon section={section} />
          <span>
            <h2 id={`${section}-heading`}>{sectionCopy[0]}</h2>
            <p>{sectionCopy[1]}</p>
          </span>
        </div>
        <strong className="count-pill">{chats.length}</strong>
      </header>
      <div className="column-list">
        {!chats.length && <EmptyColumn section={section} />}
        {chats.map((chat) => (
          <ChatCard
            key={chat.id}
            chat={chat}
            snapshot={snapshot}
            section={section}
            returning={returningId === chat.id}
            opening={openingId === chat.id}
            onOpen={onOpen}
            onAction={onAction}
            onArchived={onArchived}
            onEditNote={onEditNote}
          />
        ))}
      </div>
    </section>
  );
}

function CandidateModal({ candidate, projects, onClose, onSubmit }: {
  candidate: CandidateTab;
  projects: ProjectRecord[];
  onClose: () => void;
  onSubmit: (projectKey?: string, projectName?: string) => void;
}) {
  const detectedProject = projects.find((project) => project.key === candidate.detectedProjectKey);
  const [projectChoice, setProjectChoice] = useState(candidate.detectedProjectKey ? (detectedProject?.key || "detected-new") : "");
  const [projectName, setProjectName] = useState("");
  const needsName = projectChoice === "detected-new";

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal candidate-modal" role="dialog" aria-modal="true" aria-labelledby="track-title">
        <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        <span className="eyebrow">Track this tab</span>
        <h2 id="track-title">Add to Command Center</h2>
        <p className="modal-lede">The real {candidate.platform === "chatgpt" ? "ChatGPT" : "Claude"} tab will move into the managed workspace and remain open until you archive it.</p>
        <div className="candidate-preview">
          <PlatformBadge platform={candidate.platform} compact />
          <span><strong>{candidate.title}</strong><small>{candidate.platform === "chatgpt" ? "chatgpt.com" : "claude.ai"}</small></span>
        </div>
        {candidate.platform === "chatgpt" && (
          <>
            <label className="field-label">
              Native ChatGPT Project
              <select value={projectChoice} onChange={(event) => setProjectChoice(event.target.value)}>
                <option value="">No project</option>
                {candidate.detectedProjectKey && !detectedProject && <option value="detected-new">Register current project…</option>}
                {projects.map((project) => <option key={project.key} value={project.key}>{project.name}</option>)}
              </select>
            </label>
            {needsName && (
              <label className="field-label">
                Project name
                <input autoFocus value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="e.g. Growth" />
              </label>
            )}
          </>
        )}
        <div className="modal-actions">
          <button className="button ghost" onClick={onClose}>Cancel</button>
          <button
            className="button primary"
            disabled={needsName && !projectName.trim()}
            onClick={() => onSubmit(needsName ? candidate.detectedProjectKey : projectChoice || "", needsName ? projectName : undefined)}
          >Track tab</button>
        </div>
      </section>
    </div>
  );
}

function DiscoveryModal({ tabs, onClose, onChoose }: {
  tabs: CandidateTab[];
  onClose: () => void;
  onChoose: (tab: CandidateTab) => void;
}) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal discovery-modal" role="dialog" aria-modal="true" aria-labelledby="discovery-title">
        <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        <span className="eyebrow">Open tabs</span>
        <h2 id="discovery-title">Untracked AI chat tabs</h2>
        <p className="modal-lede">Command Center found these tabs. Review them individually so unrelated conversations are never watched automatically.</p>
        <div className="discovery-list">
          {tabs.map((tab) => (
            <div className="discovery-row" key={tab.tabId}>
              <PlatformBadge platform={tab.platform} compact />
              <span><strong>{tab.title}</strong><small>{tab.platform === "claude" ? "Claude" : tab.detectedProjectKey ? "ChatGPT project detected" : "ChatGPT"}</small></span>
              <button className="button secondary small" onClick={() => onChoose(tab)}>Add</button>
            </div>
          ))}
          {!tabs.length && <div className="archive-empty"><strong>Everything is accounted for</strong><p>No untracked ChatGPT or Claude tabs are open.</p></div>}
        </div>
      </section>
    </div>
  );
}

function NoteModal({ chat, onClose, onSave }: {
  chat: TrackedChat;
  onClose: () => void;
  onSave: (note: string) => void;
}) {
  const [note, setNote] = useState(chat.note ?? "");
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal note-modal" role="dialog" aria-modal="true" aria-labelledby="note-title">
        <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        <span className="eyebrow">Chat note</span>
        <h2 id="note-title">{chat.title}</h2>
        <label className="field-label">
          Note
          <textarea autoFocus maxLength={4_000} rows={7} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Context, next step, or what you are waiting for…" />
        </label>
        <div className="note-count">{note.length.toLocaleString()} / 4,000</div>
        <div className="modal-actions">
          <button className="button ghost" onClick={onClose}>Cancel</button>
          <button className="button primary" onClick={() => onSave(note.trim())}>Save note</button>
        </div>
      </section>
    </div>
  );
}

function ObserverSafetyModal({ onClose, onEnable }: { onClose: () => void; onEnable: () => void }) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="observer-title">
        <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        <span className="eyebrow warning">Experimental / Unofficial</span>
        <h2 id="observer-title">Enable passive status watching?</h2>
        <p className="modal-lede">Test this first in a separate Chrome profile with alternate ChatGPT and Claude accounts. The watcher reads visible controls only and never clicks, types, submits, reloads, or calls either platform's APIs.</p>
        <ul className="safety-list">
          <li>No message content is collected or stored.</li>
          <li>Unexpected page structure fails safely to Unknown.</li>
          <li>You can turn the observer off globally at any time.</li>
        </ul>
        <div className="modal-actions">
          <button className="button ghost" onClick={onClose}>Keep off</button>
          <button className="button primary" onClick={onEnable}>Enable observer</button>
        </div>
      </section>
    </div>
  );
}

function SettingsModal({ snapshot, onClose, onAction }: {
  snapshot: AppSnapshot;
  onClose: () => void;
  onAction: (action: () => Promise<unknown>, success?: string) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [projectName, setProjectName] = useState("");
  const [projectUrl, setProjectUrl] = useState("");

  const download = (contents: string, type: string, filename: string) => {
    const blob = new Blob([contents], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const exportData = async () => {
    const payload = await dashboardActions.exportData();
    download(JSON.stringify(payload, null, 2), "application/json", `command-center-metadata-${new Date().toISOString().slice(0, 10)}.json`);
  };

  const exportCsv = () => {
    const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const rows = snapshot.chats.map((chat) => {
      const runtime = snapshot.runtimes[chat.id];
      return [
        chat.disposition === "archived" ? "Archived" : "Watching",
        runtime?.status ?? "unknown",
        chat.platform === "chatgpt" ? "ChatGPT" : "Claude",
        chat.title,
        chat.url,
        chat.platform === "chatgpt" ? chat.projectName ?? "No project" : "",
        chat.note ?? ""
      ].map(escape).join(",");
    });
    download([
      ["Lifecycle", "Observed status", "Platform", "Title", "URL", "Project", "Note"].map(escape).join(","),
      ...rows
    ].join("\n"), "text/csv", `command-center-urls-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const exportUrlList = () => {
    const section = (title: string, chats: TrackedChat[]) => [
      title,
      ...chats.map((chat) => `${chat.platform === "chatgpt" ? "ChatGPT" : "Claude"} · ${chat.title}\n${chat.url}${chat.note ? `\nNote: ${chat.note}` : ""}`)
    ].join("\n\n");
    download([
      section("WATCHED", snapshot.chats.filter((chat) => chat.disposition !== "archived")),
      section("ARCHIVE", snapshot.chats.filter((chat) => chat.disposition === "archived"))
    ].join("\n\n---\n\n"), "text/plain", `command-center-url-list-${new Date().toISOString().slice(0, 10)}.txt`);
  };

  const importFile = async (file?: File) => {
    if (!file) return;
    const payload = JSON.parse(await file.text()) as ImportPayload;
    await dashboardActions.importData(payload);
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        <span className="eyebrow">Command Center</span>
        <h2 id="settings-title">Settings & data</h2>
        <div className="settings-row">
          <span><strong>Passive status observer</strong><small>Experimental / Unofficial</small></span>
          <button
            className={`switch ${snapshot.preferences.observerEnabled ? "on" : ""}`}
            role="switch"
            aria-checked={snapshot.preferences.observerEnabled}
            onClick={() => onAction(() => dashboardActions.setObserver(!snapshot.preferences.observerEnabled))}
          ><span /></button>
        </div>
        <div className="settings-row">
          <span><strong>Chrome Sync</strong><small>{snapshot.syncStatus.state === "ok" ? "Metadata is syncing" : snapshot.syncStatus.message}</small></span>
          <span className={`sync-chip ${snapshot.syncStatus.state}`}>{snapshot.syncStatus.state === "ok" ? "Synced" : "Local fallback"}</span>
        </div>
        <div className="settings-section">
          <h3>Metadata</h3>
          <p>Exports contain titles, URLs, notes, and organization metadata—never messages, credentials, cookies, or tokens.</p>
          <div className="button-row">
            <button className="button secondary" onClick={() => onAction(exportData, "Export created")}>Export JSON</button>
            <button className="button secondary" onClick={() => onAction(async () => exportCsv(), "CSV created")}>Export CSV</button>
            <button className="button secondary" onClick={() => onAction(async () => exportUrlList(), "URL list created")}>Export URL list</button>
            <button className="button secondary" onClick={() => fileInput.current?.click()}>Import JSON</button>
            <input
              ref={fileInput}
              type="file"
              accept="application/json"
              hidden
              onChange={(event) => onAction(() => importFile(event.target.files?.[0]), "Import complete")}
            />
          </div>
        </div>
        <div className="settings-section">
          <h3>Native ChatGPT Projects</h3>
          <p>Register each project once using its ChatGPT Project URL. Command Center stores only the name and stable project ID.</p>
          <div className="project-registration">
            <input aria-label="Project name" value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="Project name" />
            <input aria-label="ChatGPT Project URL" value={projectUrl} onChange={(event) => setProjectUrl(event.target.value)} placeholder="https://chatgpt.com/g/g-p-…/project" />
            <button
              className="button secondary"
              disabled={!projectName.trim() || !projectUrl.trim()}
              onClick={() => onAction(async () => {
                await dashboardActions.registerProject(projectName, projectUrl);
                setProjectName("");
                setProjectUrl("");
              }, "Project registered")}
            >Register project</button>
          </div>
          {!!snapshot.projects.length && <ul className="registered-projects">{snapshot.projects.map((project) => <li key={project.key}><strong>{project.name}</strong><span>{project.url}</span></li>)}</ul>}
        </div>
        <div className="settings-section danger-zone">
          <h3>Clear app data</h3>
          <p>Removes Command Center metadata and closes its managed ChatGPT and Claude tabs. Your conversations remain in their original accounts.</p>
          <button
            className="button danger"
            onClick={() => {
              if (window.confirm("Clear all Command Center metadata and close managed tabs?")) {
                onAction(() => dashboardActions.clearData(), "App data cleared");
              }
            }}
          >Clear App Data</button>
        </div>
      </section>
    </div>
  );
}

export function App() {
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null);
  const [filters, setFilters] = useState<DashboardFilters>(initialFilters);
  const [view, setView] = useState<"active" | "archive">("active");
  const [modal, setModal] = useState<Modal>(null);
  const [startProject, setStartProject] = useState("");
  const [error, setError] = useState<string>();
  const [toast, setToast] = useState<string>();
  const [openingId, setOpeningId] = useState<string>();
  const [returningId, setReturningId] = useState<string>();
  const [lastArchived, setLastArchived] = useState<TrackedChat>();
  const [selectedCandidate, setSelectedCandidate] = useState<CandidateTab>();
  const [noteChat, setNoteChat] = useState<TrackedChat>();
  const [keyboardIndex, setKeyboardIndex] = useState(-1);
  const searchRef = useRef<HTMLInputElement>(null);
  const lastOpenedId = useRef<string | undefined>(undefined);

  const refresh = useCallback(async () => {
    try {
      setSnapshot(await dashboardActions.getState());
      setError(undefined);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load the Command Center.");
    }
  }, []);

  useEffect(() => {
    void refresh();
    return subscribeToState(() => void refresh());
  }, [refresh]);

  useEffect(() => {
    if (snapshot?.candidateTab) {
      setSelectedCandidate(snapshot.candidateTab);
      setModal("candidate");
    }
  }, [snapshot?.candidateTab]);

  useEffect(() => {
    const timer = window.setInterval(() => void refresh(), 10_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      if (lastOpenedId.current) {
        setReturningId(lastOpenedId.current);
        window.setTimeout(() => setReturningId(undefined), 620);
      }
      void refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onVisibility);
    };
  }, [refresh]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const editing = ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
      if (event.key === "/" && !editing) {
        event.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (editing || modal) return;
      const cards = [...document.querySelectorAll<HTMLElement>("[data-chat-card]")];
      if ((event.key === "j" || event.key === "ArrowDown") && cards.length) {
        event.preventDefault();
        const next = Math.min(keyboardIndex + 1, cards.length - 1);
        setKeyboardIndex(next);
        cards[next]?.querySelector<HTMLButtonElement>(".chat-open")?.focus();
      }
      if ((event.key === "k" || event.key === "ArrowUp") && cards.length) {
        event.preventDefault();
        const next = Math.max(keyboardIndex - 1, 0);
        setKeyboardIndex(next);
        cards[next]?.querySelector<HTMLButtonElement>(".chat-open")?.focus();
      }
      if (event.key === "Escape") setFilters((current) => ({ ...current, query: "" }));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [keyboardIndex, modal]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(undefined), 3_000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const onAction = useCallback((action: () => Promise<unknown>, success?: string) => {
    void action()
      .then(() => {
        if (success) setToast(success);
        return refresh();
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "That action failed."));
  }, [refresh]);

  const filtered = useMemo(() => {
    if (!snapshot) return [];
    return sortChats(snapshot.chats.filter((chat) => matchesFilters(chat, filters)));
  }, [snapshot, filters]);

  const bySection = useMemo(() => {
    const result: Record<WorkflowSection, TrackedChat[]> = { working: [], ready: [], later: [], unknown: [], archive: [] };
    if (!snapshot) return result;
    for (const chat of filtered) result[workflowSection(chat, snapshot.runtimes[chat.id])].push(chat);
    return result;
  }, [filtered, snapshot]);

  const activeTotal = bySection.working.length + bySection.ready.length + bySection.later.length + bySection.unknown.length;
  const closedActiveCount = snapshot
    ? snapshot.chats.filter((chat) => chat.disposition !== "archived" && !snapshot.runtimes[chat.id]?.openOnDevice).length
    : 0;

  const openChat = (chat: TrackedChat) => {
    lastOpenedId.current = chat.id;
    setOpeningId(chat.id);
    window.setTimeout(() => {
      onAction(() => dashboardActions.open(chat.id));
      setOpeningId(undefined);
    }, 170);
  };

  const newChat = (platform: ChatPlatform) => onAction(() => dashboardActions.newChat(
    platform,
    platform === "chatgpt" ? startProject || undefined : undefined
  ));

  if (!snapshot) {
    return <main className="loading-screen"><AppMark /><strong>Opening Command Center…</strong>{error && <p>{error}</p>}</main>;
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <AppMark />
          <span><strong>Command Center</strong><small>What should you look at next?</small></span>
        </div>
        <div className="topbar-actions">
          <label className="project-start-select">
            <span className="sr-only">Start in project</span>
            <select value={startProject} onChange={(event) => setStartProject(event.target.value)}>
              <option value="">No project</option>
              {snapshot.projects.map((project) => <option key={project.key} value={project.key}>{project.name}</option>)}
            </select>
          </label>
          <button className="button primary platform-new" onClick={() => newChat("chatgpt")}><PlatformIcon platform="chatgpt" /> New ChatGPT</button>
          <button className="button secondary platform-new" onClick={() => newChat("claude")}><PlatformIcon platform="claude" /> New Claude</button>
          <button
            className={`button track-button${snapshot.candidateTab || snapshot.discoveredTabs.length ? " has-candidate" : ""}`}
            onClick={() => {
              if (snapshot.candidateTab) {
                setSelectedCandidate(snapshot.candidateTab);
                setModal("candidate");
              } else if (snapshot.discoveredTabs.length) {
                setModal("discovery");
              } else {
                setToast("No untracked ChatGPT or Claude tabs are open.");
              }
            }}
          >Find Open Tabs{snapshot.discoveredTabs.length ? ` (${snapshot.discoveredTabs.length})` : ""}</button>
          <button
            className="icon-button top-icon"
            aria-label={snapshot.isFullscreen ? "Exit full screen" : "Enter full screen"}
            title={snapshot.isFullscreen ? "Exit full screen" : "Enter full screen"}
            onClick={() => onAction(() => dashboardActions.setFullscreen(!snapshot.isFullscreen))}
          >{snapshot.isFullscreen ? "↙" : "↗"}</button>
          <button className="icon-button top-icon" aria-label="Settings" title="Settings" onClick={() => setModal("settings")}>•••</button>
        </div>
      </header>

      {!snapshot.preferences.observerEnabled && (
        <aside className="observer-banner">
          <span className="banner-dot" />
          <div><strong>Status observer is off</strong><p>Chats stay organized, but live Working and Ready status is unavailable.</p></div>
          <button onClick={() => setModal("observer-safety")}>Review & enable</button>
        </aside>
      )}

      {closedActiveCount > 0 && (
        <aside className="recovery-banner">
          <div><strong>{closedActiveCount} watched {closedActiveCount === 1 ? "chat is" : "chats are"} closed</strong><p>Reopen the saved conversations and resume status watching.</p></div>
          <button className="button secondary" onClick={() => onAction(() => dashboardActions.reopenAll(), "Watched chats reopened")}>Reopen watched chats</button>
        </aside>
      )}

      <section className="control-surface" aria-label="Chat navigation and filters">
        <div className="search-box">
          <span aria-hidden="true">⌕</span>
          <input
            ref={searchRef}
            type="search"
            placeholder="Search titles and notes"
            aria-label="Search chats"
            value={filters.query}
            onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
          />
          <kbd>/</kbd>
        </div>
        <nav className="view-tabs" aria-label="Command Center views">
          <button className={view === "active" ? "selected" : ""} onClick={() => setView("active")}>Home <span>{activeTotal}</span></button>
          <button className={view === "archive" ? "selected" : ""} onClick={() => setView("archive")}>Archive <span>{bySection.archive.length}</span></button>
        </nav>
        <div className="filter-divider" />
        <div className="platform-filter" role="group" aria-label="Chat platform">
          {(["all", "chatgpt", "claude"] as const).map((platform) => (
            <button key={platform} className={filters.platform === platform ? "selected" : ""} onClick={() => setFilters((current) => ({ ...current, platform }))}>
              {platform === "all" ? "All" : <><PlatformIcon platform={platform} />{platform === "chatgpt" ? "ChatGPT" : "Claude"}</>}
            </button>
          ))}
        </div>
        <label className="filter-select">
          <span>Project</span>
          <select value={filters.project} onChange={(event) => setFilters((current) => ({ ...current, project: event.target.value }))}>
            <option value="all">All projects</option>
            <option value="unassigned">No project</option>
            {snapshot.projects.map((project) => <option key={project.key} value={project.key}>{project.name}</option>)}
          </select>
        </label>
        <button className={`toggle-filter${filters.unreadOnly ? " selected" : ""}`} onClick={() => setFilters((current) => ({ ...current, unreadOnly: !current.unreadOnly }))}>Unread</button>
        <button className={`toggle-filter${filters.flaggedOnly ? " selected" : ""}`} onClick={() => setFilters((current) => ({ ...current, flaggedOnly: !current.flaggedOnly }))}>Flagged</button>
        {(filters.query || filters.platform !== "all" || filters.project !== "all" || filters.flaggedOnly || filters.unreadOnly) && (
          <button className="clear-filter" onClick={() => setFilters(initialFilters)}>Clear</button>
        )}
      </section>

      {snapshot.syncStatus.state === "fallback" && (
        <div className="sync-warning" role="status">Chrome Sync is unavailable. Changes are safe locally and will retry on the next update.</div>
      )}

      {error && <div className="error-toast" role="alert"><span>{error}</span><button aria-label="Dismiss error" onClick={() => setError(undefined)}>×</button></div>}

      {view === "active" ? (
        <>
          <section className="workflow-grid" aria-label="Active chats">
            {(["working", "ready", "later"] as const).map((section) => (
              <WorkflowColumn
                key={section}
                section={section}
                chats={bySection[section]}
                snapshot={snapshot}
                returningId={returningId}
                openingId={openingId}
                onOpen={openChat}
                onAction={onAction}
                onArchived={setLastArchived}
                onEditNote={(chat) => { setNoteChat(chat); setModal("note"); }}
              />
            ))}
          </section>

          {bySection.unknown.length > 0 && (
            <section className="unknown-section" aria-labelledby="unknown-heading">
              <header><SectionIcon section="unknown" /><span><h2 id="unknown-heading">Needs recovery</h2><p>These chats are visible, but their live state is not reliable.</p></span><strong>{bySection.unknown.length}</strong></header>
              <div className="unknown-list">
                {bySection.unknown.map((chat) => (
                  <div className="unknown-row" key={chat.id} data-chat-card>
                    <span className="unknown-mark">?</span>
                    <span className="unknown-copy"><strong>{chat.title}</strong><small>{snapshot.runtimes[chat.id]?.reason?.replaceAll("-", " ") || "Not open on this device"}</small></span>
                    <PlatformBadge platform={chat.platform} />
                    {snapshot.runtimes[chat.id]?.reason === "navigated-to-different-chat" ? (
                      <button className="button secondary small" onClick={() => onAction(() => dashboardActions.returnToTrackedChat(chat.id), "Returning to tracked chat")}>Return to tracked chat</button>
                    ) : (
                      <button className="button secondary small" onClick={() => onAction(() => dashboardActions.reopen(chat.id))}>Reopen</button>
                    )}
                    <button className="icon-button" title="Stop watching and close" aria-label={`Stop watching and close ${chat.title}`} onClick={() => { setLastArchived(chat); onAction(() => dashboardActions.archive(chat.id), "Stopped watching and moved to Archive"); }}><ActionIcon name="stop" /></button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      ) : (
        <section className="archive-view" aria-labelledby="archive-heading">
          <header><span><span className="eyebrow">History</span><h1 id="archive-heading">Archive</h1><p>These chats are no longer watched and their managed tabs are closed. Their URLs, notes, and organization stay available.</p></span><strong>{bySection.archive.length}</strong></header>
          {!bySection.archive.length ? <div className="archive-empty"><SectionIcon section="archive" /><strong>No archived chats</strong><p>Use Stop watching &amp; close to move a chat here.</p></div> : (
            <div className="archive-list">
              {bySection.archive.map((chat) => (
                <article key={chat.id}>
                  <span><strong>{chat.title}</strong><small><PlatformBadge platform={chat.platform} /> {chat.platform === "chatgpt" ? chat.projectName || "No project" : ""} · Archived {relativeTime(chat.archivedAt)}</small>{chat.note && <p>{chat.note}</p>}</span>
                  <button className="button secondary small" onClick={() => onAction(() => dashboardActions.restore(chat.id), "Restored and reopened")}>Restore</button>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      <footer className="app-footer">
        <span><kbd>j</kbd><kbd>k</kbd> Navigate</span>
        <span><kbd>⌘</kbd><kbd>⇧</kbd><kbd>Space</kbd> Dashboard / last chat</span>
        <span className={`observer-status ${snapshot.preferences.observerEnabled ? "on" : "off"}`}><i />Observer {snapshot.preferences.observerEnabled ? "on" : "off"}</span>
      </footer>

      {modal === "candidate" && selectedCandidate && (
        <CandidateModal
          candidate={selectedCandidate}
          projects={snapshot.projects}
          onClose={() => {
            setModal(null);
            setSelectedCandidate(undefined);
            if (snapshot.candidateTab?.tabId === selectedCandidate.tabId) onAction(() => dashboardActions.dismissCandidate());
          }}
          onSubmit={(projectKey, projectName) => {
            setModal(null);
            onAction(() => dashboardActions.trackTab(selectedCandidate.tabId, projectKey, projectName), "Tab added to Command Center");
            setSelectedCandidate(undefined);
          }}
        />
      )}
      {modal === "discovery" && (
        <DiscoveryModal
          tabs={snapshot.discoveredTabs}
          onClose={() => setModal(null)}
          onChoose={(tab) => { setSelectedCandidate(tab); setModal("candidate"); }}
        />
      )}
      {modal === "note" && noteChat && (
        <NoteModal
          chat={noteChat}
          onClose={() => { setModal(null); setNoteChat(undefined); }}
          onSave={(note) => {
            setModal(null);
            onAction(() => dashboardActions.setFields(noteChat.id, { note }), "Note saved");
            setNoteChat(undefined);
          }}
        />
      )}
      {modal === "observer-safety" && (
        <ObserverSafetyModal
          onClose={() => setModal(null)}
          onEnable={() => { setModal(null); onAction(() => dashboardActions.setObserver(true), "Observer enabled"); }}
        />
      )}
      {modal === "settings" && <SettingsModal snapshot={snapshot} onClose={() => setModal(null)} onAction={onAction} />}

      {lastArchived && (
        <div className="undo-toast" role="status">
          <span><strong>{lastArchived.title}</strong> stopped and archived</span>
          <button onClick={() => { onAction(() => dashboardActions.restore(lastArchived.id), "Restored and reopened"); setLastArchived(undefined); }}>Undo</button>
          <button aria-label="Dismiss" onClick={() => setLastArchived(undefined)}>×</button>
        </div>
      )}
      {toast && <div className="success-toast" role="status">{toast}</div>}
    </main>
  );
}
