# Privacy

AI Chat Command Center stores only the metadata needed to organize chats you intentionally track.

## Durable Chrome Sync metadata

- Exact Chrome tab title
- ChatGPT or Claude URL and detected platform
- Optional native ChatGPT Project key, name, and URL
- Optional user-authored chat note
- Flag, unread, snooze, archive, and ordering metadata
- Observer and interface preferences

## Device-local runtime data

- Chrome tab and window IDs
- Managed tab-group ID
- Observer connection state
- Live Working, Ready, or Unknown status and a short diagnostic reason
- The tab's current URL so navigation away from the intended conversation can be detected

## Data never collected

The extension does not collect or store prompts, answers, message text, files, tool output, credentials, cookies, session tokens, passkeys, browser history, or network traffic. It has no backend, telemetry, analytics, advertising, or third-party app server.

## Export, import, and deletion

JSON, CSV, and URL-list exports contain metadata and any notes the user entered in Command Center. **Clear App Data** removes Command Center metadata and closes managed ChatGPT and Claude tabs. It does not delete conversations from either account.

Chrome Sync behavior is governed by the user's Chrome/Google account settings. If Sync is unavailable or reaches a quota, the extension continues with a visible local fallback.
