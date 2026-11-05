# Dexter

Windows and macOS. The Mac version has not been tried on a real Mac yet, so treat it as a beta.

A desktop notch for one project. You choose who writes the code. Claude, ChatGPT, Grok, and Gemini sign in through their own browser login, the same way their desktop apps do. There is no API-key form.

```powershell
npm install
npm start          # run from source
npm test           # tests (Undo and team sync need Git)
npm run dist:win   # Windows installer in release/ (npm run dist:mac on a Mac)
```

Releases and code signing: [docs/releasing.md](docs/releasing.md). What each AI provider's terms say: [docs/provider-terms.md](docs/provider-terms.md).

The notch hangs from the top of the screen.

- **Any two models.** Sign in to at least two models, any two. The ones you skip are never asked, and nothing waits on them. If the writer you picked is not signed in, the signed-in models pick the team instead. With None or You, the models still answer, as advice only.
- **Writes** is the only standing choice: None, You, Auto, Cursor, Claude, GPT, Grok, or Gemini. Until you pick, nobody is told to edit files.
- **Auto** lets the models decide who does each job. For a Work, Debug, or Test message, one signed-in model picks a **builder** (does the task, may change files, with Undo) and a different **reviewer** (checks the change without editing; Apply sends its fixes back). With one model signed in, it just does the task. Plan and Explain use one model; Review, Brainstorm, and Debate use every model, as before.
- **Mode** decides who answers and what they are told to do. Pick it in Settings, above the chat box, or in the notch:

  | Mode | Who answers | Changes files? | Use it for |
  |---|---|---|---|
  | **Auto** (default) | One model picks the mode | Only if it picks Work, Debug, or Test | Not knowing which mode fits: it reads the message and picks one, plus the team when Writes is Auto |
  | Work | The writer | Yes, with Undo | Doing a task |
  | Debug | The writer | Yes, with Undo | Finding a bug's cause and fixing it with the smallest change |
  | Test | The writer | Yes, with Undo | Adding tests, running them, reporting results |
  | Plan | One model | No | A step-by-step plan. Apply hands it to the writer |
  | Explain | One model | No | Plain-words explanations with file paths |
  | Review | Every model | No | Problems ranked by severity. Apply has the writer fix them |
  | Brainstorm | Every model | No | A few concrete ideas with why and the main risk |
  | Debate | Every model, twice | No | Positions, then replies to each other |

  Debug and Test without a model writer give advice only. The instructions each mode gives the models are in `src/modes.ts`.
- **Sign in** opens that model's own login. Claude uses `claude auth login`. ChatGPT uses `codex login`. Grok uses `grok login`. Gemini uses Google's Gemini CLI: the app installs it with npm (needs Node.js 20+) after asking, picks Sign in with Google, and answers its one confirmation question.

Each folder you choose gets its own brain in `folder/.brain/`: its own goal, decisions, handoffs, chats, writer, and mode. The models only see that folder's memory.

If a model's sign-in tool is not installed, the app asks before it downloads and installs it.

Cursor reads the same choice through the project-brain tools. If Cursor is not the writer, it is told not to edit files.

## What it does

- **Undo.** Before the writer changes anything, the folder is snapshotted into `.brain/checkpoints`, a hidden Git history separate from your own `.git`. After a task, the reply lists the changed files and has an **Undo** button. Undo needs Git installed.
- **Apply.** After a debate, each model's answer has an **Apply** button. It saves your choice as a decision, and the writer builds it.
- **Live progress and Stop.** While a model works, you see what it is doing (for Claude: each file it reads or edits) and a **Stop** button.
- **Health check.** On start, and with **Check tools again** in Integrations, each tool is checked: installed, signed in, and still accepting the options this app uses.
- **Usage.** Integrations shows each model's asks and tokens for the last 7 days, and when it last hit a plan limit.
- **Memory.** The Memory page shows the goal, current task, decisions and handoffs. You can edit, delete, search, and summarize older work so every model still knows it.
- **First-run setup.** New installs start with four steps: folder, sign-in, writer, first question.
- **Team memory.** Commit `.brain` with your code, or press **Sync team memory** in Settings. Decisions and handoffs merge line by line. Your writer, mode, chats and Undo history stay on your computer.
