# Graph Report - project-brain  (2026-11-05)

## Corpus Check
- 37 files · ~15,314 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 8 file(s) not represented in the graph (top: .jsonl 3, .css 2, .mdc 1)

## Summary
- 348 nodes · 782 edges · 15 communities (13 shown, 2 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 18 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- brain.ts
- session.ts
- Model Accounts and Sign-in
- Notch UI Interactions
- Electron Preload and Package
- Electron Main Process
- Desktop App Pages and Memory
- Desktop Chat App
- chat.ts
- ask.ts
- TypeScript Compiler Config
- Graphify Agent Rules
- Brain Manifest Schema
- MCP Server Config
- Graphify Skill Setup

## God Nodes (most connected - your core abstractions)
1. `main()` - 24 edges
2. `loadBrain()` - 22 edges
3. `brainDir()` - 19 edges
4. `compileBrief()` - 17 edges
5. `runAsk()` - 16 edges
6. `route()` - 15 edges
7. `setNow()` - 13 edges
8. `addHandoff()` - 13 edges
9. `setWriter()` - 12 edges
10. `addDecision()` - 12 edges

## Surprising Connections (you probably didn't know these)
- `Browser login sign-in (no API keys)` --semantically_similar_to--> `Chrome-only sign-in`  [INFERRED] [semantically similar]
  README.md → docs/work-so-far.md
- `Writes choice (code writer)` --semantically_similar_to--> `codeWriter in .brain/manifest.json`  [INFERRED] [semantically similar]
  README.md → docs/work-so-far.md
- `Debate ask form` --implements--> `Debate flow`  [INFERRED]
  desktop/notch.html → docs/work-so-far.md
- `Mode: Work or Debate` --conceptually_related_to--> `Debate flow`  [INFERRED]
  README.md → docs/work-so-far.md
- `Project goal: shared project memory` --conceptually_related_to--> `Work so far`  [INFERRED]
  .brain/goal.md → docs/work-so-far.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **.brain shared project memory** — docs_work_so_far_brain_memory, brain_goal, brain_now, docs_work_so_far_chat_jsonl, docs_work_so_far_codewriter [INFERRED 0.80]
- **Code writer gating across UI and debate** — readme_writes_choice, docs_work_so_far_codewriter, desktop_app_settings_page, desktop_notch, docs_work_so_far_debate [INFERRED 0.80]
- **Graphify agent instruction files** — agents_graphify_rules, claude_graphify_rules, claude_claude_graphify_skill [INFERRED 0.85]

## Communities (15 total, 2 thin omitted)

### Community 0 - "brain.ts"
Cohesion: 0.09
Nodes (51): AskModel, accessFolder(), addDecision(), addHandoff(), appendJsonl(), brainDir(), BrainMode, clip() (+43 more)

### Community 1 - "session.ts"
Cohesion: 0.22
Nodes (18): accountStates(), Provider, BrainSnapshot, Decision, ModelKey, clip(), compileBrief(), formatDecision() (+10 more)

### Community 2 - "Model Accounts and Sign-in"
Cohesion: 0.14
Nodes (38): AccountState, askClaude(), askCodex(), askCursor(), askGrok(), askModel(), beginSignIn(), chromeExecutable() (+30 more)

### Community 3 - "Notch UI Interactions"
Cohesion: 0.08
Nodes (31): accountsEl, ask, Axis, bar, body, chat, closed, engaged() (+23 more)

### Community 4 - "Electron Preload and Package"
Cohesion: 0.06
Nodes (29): api, { contextBridge, ipcRenderer }, bin, project-brain, dependencies, @modelcontextprotocol/sdk, zod, description (+21 more)

### Community 5 - "Electron Main Process"
Cohesion: 0.05
Nodes (9): appRoot(), chatState(), createWindow(), here, notchBounds(), snapshot(), workRoot(), loadEnvFile() (+1 more)

### Community 6 - "Desktop App Pages and Memory"
Cohesion: 0.12
Nodes (22): Project goal: shared project memory, Current task: find best AI video generation tool, Chat page, desktop/app.css, Desktop app window (app.html), Integrations page, Settings page (Writes/Mode), Debate ask form (+14 more)

### Community 7 - "Desktop Chat App"
Cohesion: 0.11
Nodes (21): about, chooseFolder(), composer, connectNote, loadChat(), menu, menuNote, message (+13 more)

### Community 8 - "chat.ts"
Cohesion: 0.28
Nodes (18): appendChat(), blankThread(), ChatIndex, ChatMessage, chatsDir(), ChatThread, createThread(), currentThreadId() (+10 more)

### Community 9 - "ask.ts"
Cohesion: 0.32
Nodes (10): AskResult, clip(), runAsk(), Handoff, askSystem(), clean(), ParsedHandoff, parseHandoffBlock() (+2 more)

### Community 10 - "TypeScript Compiler Config"
Cohesion: 0.15
Nodes (12): compilerOptions, declaration, esModuleInterop, module, moduleResolution, outDir, rootDir, skipLibCheck (+4 more)

### Community 11 - "Graphify Agent Rules"
Cohesion: 0.29
Nodes (5): graphify-out/GRAPH_REPORT.md, graphify-out/graph.json, Graphify agent rules, graphify-out/wiki/index.md, Graphify project rules

### Community 12 - "Brain Manifest Schema"
Cohesion: 0.29
Nodes (6): codeWriter, created, mode, name, updated, version

## Knowledge Gaps
- **11 isolated node(s):** `C:\Program Files\nodejs\node.exe`, `@types/node`, `typescript`, `graphify-out/graph.json`, `graphify-out/GRAPH_REPORT.md` (+6 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 132 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `electron` connect `Electron Preload and Package` to `Electron Main Process`?**
  _High betweenness centrality (0.054) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `compileBrief()` (e.g. with `formatDecision()` and `formatHandoff()`) actually correct?**
  _`compileBrief()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `C:\Program Files\nodejs\node.exe`, `@types/node`, `typescript` to the rest of the system?**
  _11 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `brain.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.094824016563147 - nodes in this community are weakly interconnected._
- **Why does `Desktop app window (app.html)` connect `Desktop App Pages and Memory` to `Desktop Chat App`?**
  _High betweenness centrality (0.024) - this node is a cross-community bridge._
- **Should `Model Accounts and Sign-in` be split into smaller, more focused modules?**
  _Cohesion score 0.13846153846153847 - nodes in this community are weakly interconnected._
- **Why does `Notch UI (notch.html)` connect `Desktop App Pages and Memory` to `Notch UI Interactions`?**
  _High betweenness centrality (0.023) - this node is a cross-community bridge._