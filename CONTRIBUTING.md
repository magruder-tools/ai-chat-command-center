# Contributing

Thanks for helping make AI Chat Command Center more dependable.

## Privacy boundary

Never commit or paste real prompts, answers, conversation titles, conversation URLs or IDs, project IDs, account details, cookies, tokens, credentials, client information, or screenshots from an authenticated account. Use the synthetic demo route and invented identifiers in tests, issues, and pull requests.

## Development

Requirements: Node.js 22 or newer and pnpm 11.

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm e2e
```

Automated tests must remain local and synthetic. They must not sign in to ChatGPT or Claude, submit prompts, access private APIs, or inspect conversation content.

## Observer changes

Provider interfaces change frequently. Keep provider-specific selectors centralized in `src/content/observer.ts`, prefer stable accessibility or explicit state attributes, fail to Unknown when evidence is missing, and include a regression fixture for every selector change.

For a broken observer, open the observer bug form and report only:

- Platform and plan tier
- Browser and extension versions
- Whether the page showed Working, Ready, or Unknown
- The synthetic structural attribute or control that changed

Do not attach a real page dump or screenshot containing conversation content.

## Pull requests

Keep changes focused, explain the user-visible behavior, include tests, and confirm the full verification suite passes. By contributing, you agree that your contribution is licensed under the repository's MIT License.
