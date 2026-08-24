# Alternate-profile manual safety checklist

Complete this in a separate Chrome profile with alternate ChatGPT and Claude accounts before enabling the observer on primary accounts.

## Preparation

- [ ] Download and extract a GitHub release, then load the extracted folder from `chrome://extensions`; source contributors can instead build and load `release/unpacked/`.
- [ ] Pin the extension and open its dedicated workspace.
- [ ] Confirm the observer is off by default.
- [ ] Open DevTools for a supported chat tab and the extension service worker if you want to inspect network/activity evidence.

## No-automation boundary

With the observer off, then on, verify that the extension causes none of the following:

- [ ] No prompt text is typed or submitted.
- [ ] No buttons, approvals, confirmations, forms, uploads, regenerate, or stop controls are clicked.
- [ ] No page reloads or repeated navigation occur.
- [ ] No new ChatGPT or Claude fetch, XHR, WebSocket, GraphQL, or private API requests are caused by the observer.
- [ ] No cookies, session tokens, passkeys, credentials, messages, files, or tool output appear in extension storage or JSON export.

## Workspace behavior

- [ ] Clicking the toolbar icon opens or focuses one dedicated maximized workspace window.
- [ ] The dashboard is the first tab.
- [ ] New ChatGPT and New Claude open real provider tabs without selecting modes or submitting anything.
- [ ] **Find Open Tabs** lists every open untracked ChatGPT and Claude tab and watches only tabs confirmed individually.
- [ ] Clicking the toolbar icon from an untracked supported tab offers registration, shows the correct platform mark, and moves the confirmed tab into the managed window.
- [ ] All tracked tabs belong to the **Command Center Chats** group.
- [ ] Returning to the dashboard collapses the managed group.
- [ ] `Command+Shift+Space` toggles between the dashboard and the most recent tracked chat.
- [ ] Attempting to move a tracked tab to an ordinary window moves it back into the managed workspace.

## Title and lifecycle

- [ ] A new record initially shows the exact current Chrome tab title.
- [ ] When ChatGPT or Claude generates a title, the row changes to that exact title.
- [ ] A later title change updates again without creating a separate display name.
- [ ] Working changes to Ready when the visible running control disappears.
- [ ] A dashboard-created chat reports Ready before its first prompt, then Working during its first response without requiring the toolbar icon.
- [ ] Ready changes back to Working if a new run starts.
- [ ] Finished answers, natural-language questions, approvals, confirmations, and forms all remain Ready.
- [ ] Viewing a Ready chat keeps it tracked.
- [ ] Leave a Ready chat in the background for at least six minutes: it remains in Ready and may show Last checked rather than Needs recovery.
- [ ] Open a stale or Chrome-paused Ready chat: it stays Ready while the observer reconnects and the timestamp refreshes automatically.
- [ ] Leave a Working chat without an observer update for more than 90 seconds: it moves to Needs recovery rather than remaining falsely Working.
- [ ] A frozen or discarded Ready tab is labeled Paused by Chrome while retaining its last Ready state; activating it rescans automatically.
- [ ] Snoozing moves the chat to Later while observer changes continue underneath.
- [ ] **Stop watching & close** closes the tab and retains its metadata in Archive.
- [ ] Undo and Restore reopen the saved provider URL.

## Failure and recovery

- [ ] Turn the observer off: live statuses become Unknown/observer off rather than stale Ready or Working.
- [ ] Close a tracked tab: the record becomes Unknown with Reopen.
- [ ] Navigate a tracked tab to another conversation or provider: status becomes Unknown and **Return to tracked chat** restores the intended URL.
- [ ] Discard or freeze a test tab if practical: status becomes Unknown.
- [ ] Change or remove the synthetic test landmark: selector failure becomes Unknown without a reload.
- [ ] Restart Chrome: metadata returns, open tabs are reconstructed when possible, and device-local status does not pretend to be current before the observer reconnects.
- [ ] Close the workspace window, reopen the extension, and use **Reopen watched chats** to restore active records.

## Filters and data

- [ ] Search matches Chrome tab titles and Command Center notes.
- [ ] ChatGPT/Claude, Project, No project, unread, and flag filters combine correctly.
- [ ] A Project is detected only from an explicit stable `g-p-*` URL segment or assigned manually.
- [ ] JSON, CSV, and URL-list exports contain watched and archived metadata but no conversation content or authentication data.
- [ ] Import restores metadata.
- [ ] Clear App Data removes Command Center records and closes managed tabs without deleting conversations from either account.

Record the extension version, Chrome version, ChatGPT and Claude UI dates, and any selector that failed before deciding whether to enable the observer on primary accounts.
