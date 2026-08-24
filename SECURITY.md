# Security

## Scope

AI Chat Command Center is a local Manifest V3 extension. It has no backend, analytics, telemetry, ads, API keys, authentication system, or remote executable code.

## Permissions

The extension requests only `storage`, `tabs`, `tabGroups`, `scripting`, and host access to `https://chatgpt.com/*` and `https://claude.ai/*`. The narrow `scripting` permission repairs the packaged passive observer in already-open supported chat tabs; it never injects remote code. The extension does not request notifications, cookies, `webRequest`, debugger, history, or all-sites access.

## Observer guarantees

The content script passively inspects a small, centralized set of visible controls and composer landmarks. It does not collect message text, prompts, answers, files, or tool output. It never clicks, types, submits, approves, rejects, uploads, regenerates, stops, reloads, fetches, opens WebSockets, calls GraphQL, or uses private platform endpoints.

Messages from the content script are validated for message type, observer version, allowed status, bounded reason, sender tab, managed window, tracked platform, and the exact `https://chatgpt.com` or `https://claude.ai` host. Unexpected states fail to **Unknown**.

## Reporting a vulnerability

Use a [private GitHub security advisory](https://github.com/magruder-tools/ai-chat-command-center/security/advisories/new). Do not include account credentials, cookies, tokens, passkeys, real conversation content, or other sensitive material. Provide the affected version, a concise reproduction using synthetic data, and the expected/actual behavior.

## Testing boundary

Development and CI tests must use local synthetic pages. Manual selector verification on the real sites must remain read-only and must not submit prompts, while automated tests never sign into ChatGPT or Claude.
