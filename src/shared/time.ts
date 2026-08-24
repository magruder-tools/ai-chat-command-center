export function relativeTime(timestamp: number | undefined, now = Date.now()): string {
  if (!timestamp) return "Not observed";
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (seconds < 45) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function snoozeLabel(timestamp: number | undefined, now = Date.now()): string {
  if (!timestamp) return "Later";
  const date = new Date(timestamp);
  const today = new Date(now);
  if (date.toDateString() === today.toDateString()) {
    return `Until ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  }
  return `Until ${date.toLocaleDateString([], { month: "short", day: "numeric" })}`;
}
