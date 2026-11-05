# Work so far

Dexter is a shared memory for Cursor, Claude, ChatGPT, and Grok. The person chooses who writes code. That choice is `codeWriter` in `.brain/manifest.json`. Unassigned means nobody edits. Debate stores proposals and does not edit files unless that model is the assigned writer.

## Decisions

- The user chooses who writes code. Nobody else edits files.
- Sign-in opens Chrome only. The person never sees a terminal, an installer, or an API key prompt.
- The desktop app is Home, Chat, Integrations, and a user panel. Home stays empty. Chat is stored in `.brain/chat.jsonl`. The notch stays the quick bar.
- The desktop app can read this project folder. Only the assigned writer can change files.

## What is built

- `.brain/` holds the goal, the current task, decisions, and handoffs. The CLI and the MCP server read and write that memory.
- Sign-in uses each model's own login in the background, then Chrome opens the real account page. Claude, ChatGPT, and Grok can be signed in. Signing out of a model does not sign out of the Cursor editor.
- A debate asks every signed-in model. One model failing does not cancel the others. A switched-off model in Integrations is skipped, and its sign-in stays.
- Cursor is given the folder and trusted. It edits only when it is the assigned writer. Claude is started from its installed program and can read the folder. ChatGPT reads the folder through the account's available model.
- The notch hangs from the top edge of the screen. It rests as a small cap. Hover grows it on a spring, the side curves join that edge, and leaving closes it. Replies scroll inside the panel.
- The desktop window has a blank Home, a Chat page, an Integrations table for the four models, and a user panel for this computer.

## Fixes already made

- Claude is launched by its full program path, so the debate no longer fails to start it.
- Claude is not passed an empty tools flag.
- ChatGPT is asked with a model the signed-in account accepts.
- Cursor is passed trust for this folder, and it is read-only unless it is the assigned writer.
