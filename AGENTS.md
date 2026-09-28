# Codex instructions for this task branch

Read `CODEX_TASK.md` before changing code.

The user-approved screenshot supplied with the Codex handoff is a **design contract**, not a loose inspiration. Implement the CEO dashboard to match its composition and interaction model.

Hard constraints:
- preserve current Supabase/auth/data contracts;
- do not fabricate missing company data;
- desktop CEO dashboard must fit one viewport without body scroll;
- right detail drawer = 75vw on desktop, 100vw on tablet/mobile;
- keep Thai-first labels;
- do not modify unrelated non-CEO screens;
- do not add paid APIs or unnecessary dependencies;
- verify visually in a browser before claiming completion.

If a UI choice conflicts with `CODEX_TASK.md`, follow `CODEX_TASK.md`.
