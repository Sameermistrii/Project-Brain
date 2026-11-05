# Provider terms check

Checked on 5 November 2026. This is a summary to act on, not legal advice. Terms change, so check again before you charge money.

## How Dexter uses each model

- It runs the model's own command-line tool, installed and unmodified, on the person's computer.
- Sign-in finishes in the vendor's own login page (`claude auth login`, `codex login`, `grok login`, Cursor's `agent login`).
- It never reads, stores, or sends anyone's login tokens. Each person signs in with their own account and pays their own plan.
- It does not resell or pool anyone's usage.

## Anthropic (Claude)

Source: [Claude Code legal and compliance](https://code.claude.com/docs/en/legal-and-compliance).

- **Allowed:** "an end user signing in to the unmodified Claude Code binary with their own Claude subscription." Dexter does exactly this.
- **Not allowed:** third-party developers offering "Claude.ai login into their own applications", or routing "requests through Free, Pro, or Max plan credentials on behalf of their users". Developers "may not collect, store, or intermediate Claude.ai credentials". Dexter does not log anyone in itself and holds no tokens.
- **The grey area:** Anthropic says developers *building products* "should use API key authentication", and that running Claude Code inside your products requires its Commercial Terms. Pro and Max limits also "assume ordinary, individual usage". Debate mode sends extra prompts automatically.
- **Names:** you may say the app "runs Claude Code" in plain text. You may not use Claude or Anthropic names or logos in the product name or logo, or suggest a partnership.

**Before charging money:** ask Anthropic ([contact sales](https://www.anthropic.com/contact-sales)) whether a paid desktop app that runs a person's own Claude Code sign-in is fine. If the answer is no, add an option to use the person's own Anthropic API key for Claude. That route is explicitly allowed for products.

## OpenAI (ChatGPT / Codex)

Source: [Using Codex with your ChatGPT plan](https://help.openai.com/en/articles/11369540).

- Codex is included across ChatGPT plans, and you sign in to the CLI with your ChatGPT account. Limits vary by plan.
- The help page says nothing either way about another app running the Codex CLI. No explicit permission and no explicit ban was found.

**Before charging money:** read OpenAI's current Terms of Use and Codex docs, or ask OpenAI.

## xAI (Grok)

Sources: [Grok Build public beta](https://pasqualepillitteri.it/en/news/3442/grok-build-public-beta-imagine-orchestrator-26-may-2026), [Grok in the Pi agent](https://www.basenor.com/blogs/news/grok-in-the-pi-agent-your-subscription-questions-answered).

- Grok Build is available to SuperGrok and X Premium+ subscribers.
- xAI lets the third-party Pi coding agent sign in with a Grok subscription through OAuth, which suggests xAI is open to other tools. No written policy was found.

**Before charging money:** check xAI's terms for Grok Build.

## Google (Gemini)

Not checked yet. Dexter runs Google's own open-source Gemini CLI, unmodified, and the person signs in with their own Google account through Google's login page. Gemini CLI keeps that login in the system keychain; the app never reads it.

To make sign-in work without a terminal, the app does two things in Gemini CLI on the person's behalf, only after they press Connect:

- If no sign-in method is chosen, it sets `security.auth.selectedType` to `oauth-personal` ("Sign in with Google") in `~/.gemini/settings.json`. An existing choice is never changed.
- It answers "y" to Gemini CLI's "Opening authentication page in your browser. Do you want to continue?" question.

It also passes `--skip-trust` so Gemini CLI works in the chosen folder without a terminal, the same way Cursor is passed `--trust`.

**Before charging money:** read Google's terms for Gemini CLI and Gemini Code Assist for individuals.

## Cursor

Not checked. Cursor's agent CLI is used with the person's own Cursor account. Check Cursor's terms before charging money.

## What the app already does to stay on the safe side

- Uses only the unmodified vendor tools and their own login pages.
- Keeps no tokens, and has no server that sees anyone's account.
- Refuses debates under three words, so automatic extra prompts stay tied to real questions.
- Shows per-model usage in Integrations, so people can see how much the app asked.
