# SEVAK — Codebase Guide for AI Agents

> Read this fully before making changes. It encodes hard-won constraints that are **not discoverable from the code alone** — several bugs in this app were fixed at real cost and will be re-introduced if you don't know the rules below. When in doubt, prefer the patterns already in the codebase over refactoring toward abstraction.

---

## 0. What SEVAK is

A self-hosted project-management + team-chat app for site/construction coordination. Hierarchy: **project → channel → task → chat**. Every task has a chat; channels can also have a direct "channel chat" (a hidden task). The primary interface is now **chat-first** (WhatsApp-style), with the project/task structure one tap away.

Live at `https://sevak.live`. Owner: Denish (GitHub `Anand-3690`).

---

## 1. Stack & topology

| Layer | Tech |
|---|---|
| App | Next.js 16 (App Router, Turbopack, `output: standalone`) |
| DB | Self-hosted Supabase — Postgres 17 |
| Storage | RustFS (S3-compatible) via Supabase Storage |
| Auth / Realtime | Supabase Auth + Realtime (`postgres_changes`) |
| Push | Separate Node worker (`worker/index.mjs`) using `web-push` |
| Proxy / TLS | Nginx + Let's Encrypt (DNS-01 via Cloudflare) |
| CI/CD | GitHub Actions → GHCR → server `docker compose pull` |
| Styling | Tailwind **v4**, self-hosted Barlow fonts |

- **App repo path on server:** `~/projects/Pm-app`
- **Supabase:** `~/supabase/docker` (separate compose project — do not touch)
- Everything runs on one Ubuntu box except image builds (GitHub) and DNS (Cloudflare).

---

## 2. How to deploy (never build on the server)

```
push to main → GitHub Actions builds image → GHCR → server: docker compose pull && docker compose up -d
```

CI builds **two** images: the app and `pm-app-push-worker`. A broken build fails at GitHub; production keeps the last good image. **Do not run `next build` on the server** — it has historically failed there (network/font issues).

---

## 3. HARD RULES (violating these re-introduces known bugs)

1. **`NEXT_PUBLIC_*` env vars are compile-time.** They're baked into the image at build via GitHub Variables. Changing one requires a rebuild (a push), not a server env edit.

2. **`window.*` only inside event handlers.** A `window.location.href` (or any `window`) at a component's top level crashes the production build with `window is not defined` during prerender. For redirects that must run at render/module level, use Next's `redirect()` from `next/navigation`. (This exact bug broke `/signup` — it now uses `redirect('/login')`.)

3. **The push worker MUST reach Supabase over the internal Docker network** (`http://supabase-kong:8000`), not the public `https://api.sevak.live`. Over the public URL the realtime websocket connects but `postgres_changes` never flow back — notifications silently die. The worker joins the external `supabase_default` network in `docker-compose.yaml` and reads `SUPABASE_INTERNAL_URL`. **This breaks silently whenever Docker networks are recreated** (e.g. moving the project folder). If notifications stop, check this first.

4. **`public/sw.js` owns BOTH caching AND push.** It must contain a `push` listener (calls `self.registration.showNotification`) and a `notificationclick` listener. A past rewrite for auto-update dropped these and pushes silently vanished. Any edit to `sw.js` must preserve both.

5. **Read-receipt "everyone read it" counts TASK PARTICIPANTS, not project members.** In `task-drawer.tsx`, `recipientCount` derives from `task_participants` count (minus sender), NOT `members.length`. Using project members makes the "all read → orange ticks" threshold unreachable once a project has more members than a task has participants.

6. **Migrations: always test on a throwaway `postgres:17` restored from a prod dump before applying to production.** Live-table alters and triggers have bitten us (see §7).

7. **iOS Safari:** use `overflow-x-hidden` on the scroll container; never `overflow-x: clip` or row-level `overflow-hidden` — they collapse chat bubbles on iOS.

8. **Never render `toLocaleDateString()` with no/`undefined` locale in a server component** — server vs browser locale mismatch breaks hydration. Format dates manually (month-name array + `getUTC*`). See `chat-list.tsx` `chatTime()` / `formatDate` patterns.

9. **Tailwind v4:** custom keyframes/animations are plain CSS in `globals.css` (e.g. `@keyframes bubble-in` + `.animate-bubble-in`). They work as hand-written classes (not purged). Don't assume v3 config conventions.

10. **Turbopack dev cache:** if a hydration error shows the SERVER rendering code you already changed (the `+` side of the diff is old), it's a stale dev bundle, not a bug — `rm -rf .next && npm run dev`. In production (clean CI build) this never happens.

11. **Live-data pages must be `export const dynamic = 'force-dynamic'`** — `/dashboard/projects/[id]`, `/dashboard/projects`, `/dashboard/chats`. Without it, Next serves stale cached task/chat lists on client navigation (a new task wouldn't appear until hard refresh). The service worker also skips RSC payloads (`RSC` header / `_rsc` param) so it can't cache stale data.

12. **JSX must be in `.tsx` files**, never `.ts`.

---

## 4. Data model (core tables)

- **projects** — `status` text CHECK (`active|on_hold|completed|archived`).
- **channels** — `project_id`, `name`, `position`. Model A: visible to all project members (no per-channel membership).
- **tasks** — has BOTH `project_id` AND `channel_id` (`channel_id` was added later; `project_id` kept so existing policies/triggers still work). Flag `is_channel_chat boolean` marks a channel's hidden chat task (see §6).
- **messages** — per-task chat. `reply_to_id`, `attachment_url` (path, not URL), `sender_id`.
- **message_reads** — `(message_id, user_id)` unique. Read receipts.
- **task_participants** — `(task_id, user_id)` unique. Who's in a task's chat; drives notifications and read-receipt counts.
- **project_members** — `project_id, user_id, role` (`admin|member`).
- **project_pins / task_pins** — per-user pins (`user_id, X_id`), RLS-restricted to own rows.
- **profiles** — `is_super_admin`, `is_primary_admin`, `must_change_password`.
- **push_subscriptions** — web-push endpoints per user.

### Key RPCs (all `SECURITY DEFINER`)
- `chat_list_for_user()` — the chat-first list. One row per participated task: task/channel/project names, last message, unread count, `is_pinned`, `is_channel_chat`. For channel-chat rows returns the channel name as the title.
- `unread_counts_by_task(project_id)` / `unread_counts_by_project()` — unread tallies.
- `enable_channel_chat(p_channel_id)` — creates the hidden `is_channel_chat` task + seeds all project members as participants. Admin-checked. Idempotent (returns existing task id if already enabled).

### Triggers worth knowing
- `guard_privileged_profile_columns` — blocks non-super-admins from setting `is_super_admin` / `is_primary_admin` / `must_change_password` on themselves. **This is the real privilege-escalation backstop** — the `profiles` self-update policy is otherwise permissive.
- `block_delete_nonempty_channel` — blocks deleting a channel that still has tasks, BUT allows the delete when the parent project no longer exists (so project-cascade deletion works). Any similar "block delete when non-empty" guard MUST include the cascade carve-out.
- `sync_new_member_to_channel_chats` — on `project_members` insert, adds the new member to every `is_channel_chat` task in that project (keeps channel-chat participants in sync).

### Migrations are NOT in the repo yet
Schema was applied directly to prod via `psql` across many sessions and lives only as loose `.sql` files. **Folding these into a versioned `migrations/` folder is the top open task.** If you add schema, put the `.sql` in `migrations/` and note it here.

---

## 5. Auth & permissions

- **No public signup.** `/signup` redirects to `/login`. The primary/super admin creates users (server route, service-role key); users get a default password and are forced to change it (`must_change_password`, enforced in middleware).
- **Project creation is super-admin-only** — RLS `projects_insert_super_admin` (`created_by = auth.uid() AND current_user_is_super_admin()`), UI-gated in the dashboard. Creator is added as project admin via a client-side `project_members` insert in the new-project dialog (no trigger).
- Per-project role is `admin|member` in `project_members`. `is_project_admin()` / `is_project_member()` helpers exist in SQL.

---

## 6. Chat architecture (the main surface)

### Entry point: chat-first, grouped by project
- Home is `/dashboard/chats` (`/dashboard` redirects there). `src/app/dashboard/chats/page.tsx` calls `chat_list_for_user()` and renders the two-pane shell.
- `src/components/chat-list.tsx` — the grouped list. Chats are grouped into **collapsible project cards** (sorted by recent activity, collapsed by default), with a **Pinned strip** on top. Channel chats (`is_channel_chat`, shown with a `#`) sort first within each group. Search flattens/auto-expands. Realtime-subscribes to `messages` + `message_reads` to live-update rows.
- Bottom tab bar (`bottom-tabs.tsx`, mobile only) + header nav (desktop): **Chats · Projects · You**.

### Desktop two-pane vs mobile
- `src/components/chats-two-pane.tsx` — responsive shell. **Desktop (`lg`):** list left (~420px) + open chat right, selection via `?open=<taskId>` (uses `window.history.replaceState`, no navigation). **Mobile:** list only; tapping a chat NAVIGATES to the full-page route.
- `src/components/chat-pane.tsx` — desktop right pane. Fetches a task's context (task/members/channels/isAdmin) **client-side** by `taskId`, renders `<TaskDrawer embedded>`. Shows a "Select a chat" empty state when nothing is open.
- `src/app/dashboard/chats/[taskId]/page.tsx` + `full-page-chat.tsx` — mobile full-page chat (server-fetches context, renders `<TaskDrawer fullPage>`).

### TaskDrawer is the ONE chat component — three modes
`src/components/task-drawer.tsx` renders the actual conversation everywhere, via three mutually-exclusive modes:
- **default** — slide-in drawer with backdrop (used on the task board).
- **`fullPage`** — fills the screen, back-arrow header (mobile chat route).
- **`embedded`** — fills its container, no backdrop, no close button (desktop right pane).

The container conditional and header adapt to these flags. **Do not fork this component** — reuse it via the mode flags. It contains all the hard-won chat logic: realtime messages, read receipts, swipe-to-reply (`use-swipe-to-reply.ts`), attachments (signed URLs), reply linkify, participant-based tick counts, and the new-message animation.

### Message-animation gotcha (clock-safe pattern)
New-message fade+rise animation (`animate-bubble-in`) fires only for messages that **weren't in the initial load**, tracked by an **ID set** (`initialIdsRef`), NOT by comparing `created_at` to mount time. Timestamp comparison failed because dev talks to remote Supabase and server/client clocks skew. **If you add "is this new?" logic anywhere, key off IDs, not clocks.**

### Channel chat
Opt-in per channel (admin taps the chat icon in `channel-bar.tsx` → `enable_channel_chat`). Backed by a hidden `is_channel_chat` task so ALL chat plumbing is reused unchanged. The task board query filters `.eq('is_channel_chat', false)` so it never shows as a task. Channel chats show no status dropdown (a channel isn't a task with a status).

### Notifications deep-link into chats
Worker sends `url: /dashboard/chats/<taskId>` for message/task-assignment pushes (project-level events like "added to project" / announcements point at the project). Tapping a push opens that chat (desktop: right pane; mobile: full-page route).

---

## 7. Storage

- Buckets: **avatars** (public, `getPublicUrl`), **task-attachments** & **announcement-attachments** (private, `createSignedUrl`).
- **Attachments are stored as object PATHS, not full URLs** — URLs are minted at render via `createSignedUrl`, so they survive host/protocol changes. Never store absolute storage URLs.
- Project deletion runs through a server route (`/api/delete-project`) that purges the project's storage folders (best-effort) THEN deletes the row (cascade handles child rows). Files orphaned by pre-route deletions still exist — a cleanup sweep is an open task.

---

## 8. Conventions the owner prefers

- **Discuss architecture before writing code.** Prefer explicit patterns over abstraction.
- **Mostly-mobile users:** Enter = newline in the composer; send is button-only.
- Deliverables historically came as zip + `CHANGES.md`; in-repo you should just make focused, well-scoped commits.
- Test DB changes on a throwaway `postgres:17` first (§3.6).
- The owner develops from an iPad / browser tooling at times and tests heavily on production (`sevak.live`) because **local dev auth is flaky** against remote Supabase (stale-cookie "Invalid Refresh Token" → clear site data; login uses full-navigation `window.location.href`, not `router.push`).

---

## 9. Known open items (good first tasks)

1. **Version the prod-only SQL** into `migrations/` (channels, pins, `chat_list_for_user` v1/v2, `channel-chat`, trigger fixes, project-creation restriction). Highest-value for recovery safety.
2. **Orphaned-storage cleanup sweep** (dry-run first).
3. **Local Supabase for dev** — ends the localhost auth flakiness and stops dev testing against live prod data.
4. **Link previews** in chat (design decided: server-side fetch with SSRF protection, fetch-at-send, preview first link) — not built.
5. **502 on boot** — brief window while Kong starts after a reboot; a healthcheck gate would remove it.
6. `npm audit` — a few high-sev advisories outstanding.

---

## 10. Quick file map

```
src/app/dashboard/
  layout.tsx                     header nav + BottomTabs; full-width (max-w-none)
  page.tsx                       redirects → /dashboard/chats
  chats/page.tsx                 chat-first home (RPC → ChatsTwoPane)
  chats/[taskId]/page.tsx        mobile full-page chat
  projects/page.tsx              project list (super-admin can create)
  projects/[id]/page.tsx         task board (force-dynamic; filters is_channel_chat)
src/components/
  chat-list.tsx                  grouped chat list + realtime + pins
  chats-two-pane.tsx             responsive desktop two-pane shell
  chat-pane.tsx                  desktop right pane (client-fetch by taskId)
  full-page-chat.tsx             mobile full-page wrapper
  task-drawer.tsx                THE chat component (default|fullPage|embedded)
  channel-bar.tsx                channel tabs + enable-channel-chat
  project-workspace.tsx          owns channel state + task board wiring
  bottom-tabs.tsx / members-panel.tsx / announcements.tsx / avatar.tsx
worker/index.mjs                 push worker (internal Supabase URL!)
public/sw.js                     SW: caching + push + notificationclick
src/app/globals.css              tokens + keyframes (Tailwind v4)
```

---

*This file is agent-facing context, kept alongside a human-oriented `SEVAK-HANDOFF.md`. When you change architecture, update the relevant section here so the next agent inherits accurate context — especially §3 (hard rules) and §4 (data model).*