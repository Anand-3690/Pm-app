# SEVAK — System Handoff & Operations Guide

*A self-hosted project-management and site-coordination app for interiors/contracting work.*
*Live at https://sevak.live · Owner: Denish (GitHub: Anand-3690 / anandsagardas)*

---

## 1. What this document is

A blend of three things: a **reference** explaining why the system is built the way it is, a **runbook** for operating and deploying it, and a **recovery guide** for when things break. Read section 2 for the shape of the system, then jump to whatever you need. The "Gotchas" (section 11) are hard-won — most were discovered by hitting them in production.

---

## 2. System at a glance

SEVAK is a **Next.js 16** app backed by **self-hosted Supabase**, running in Docker on a single **Ubuntu server** on a home/office connection with a static public IP. Users are site staff and coordinators; the app organises **projects → channels → tasks → chat**, with per-task file attachments, a project-level announcements board, and web-push notifications.

**The whole system runs on one machine** except for image builds (GitHub Actions) and DNS (Cloudflare). The database and all files never leave the server.

### Stack

| Layer | Technology |
|---|---|
| Frontend/Backend | Next.js 16 (App Router, Turbopack, `output: standalone`) |
| Database | Self-hosted Supabase — Postgres 17 |
| File storage | RustFS (S3-compatible), via Supabase Storage |
| Auth | Supabase Auth |
| Realtime/Chat | Supabase Realtime (`postgres_changes`) |
| Reverse proxy | Nginx |
| TLS | Let's Encrypt (DNS-01 via Cloudflare) |
| DNS | Cloudflare (DNS only — **not** proxied) |
| Push worker | Node service using `web-push` + Supabase Realtime |
| CI/CD | GitHub Actions → GHCR (container registry) |
| Styling | Tailwind v4, shadcn tokens; fonts Barlow + Barlow Condensed (self-hosted) |

### Where things live

- **App repo:** GitHub `Anand-3690/Pm-app` (GHCR path lowercased: `ghcr.io/anand-3690/pm-app`).
- **App on server:** `~/projects/Pm-app` (moved here from `~/Pm-app`).
- **Supabase on server:** `~/supabase/docker` (separate Docker Compose project — **do not move**).
- **Backups:** `~/backups/`.
- **Server LAN IP:** `192.168.201.237` · **Public IP:** `27.116.52.24`.

---

## 3. Deploy flow

Code is **never built on the server.** GitHub Actions builds the image, pushes to GHCR, the server pulls it.

```
push to main  →  GitHub Actions builds image  →  GHCR  →  server pulls  →  restart
```

**To deploy:**
```bash
# 1. commit + push
cd ~/projects/Pm-app
git add -A && git commit -m "…" && git push

# 2. watch GitHub → Actions tab until green

# 3. on the server, pull and restart
cd ~/projects/Pm-app
docker compose pull && docker compose up -d
```

`.github/workflows/build.yml` builds **both** images — the app and the push worker. `NEXT_PUBLIC_*` build args (Supabase URL, anon key, VAPID public key) are passed from GitHub repo **Variables** (not Secrets — they ship to the browser anyway).

**Critical:** `NEXT_PUBLIC_*` values are **compile-time** — baked into the image at build. Changing them requires a rebuild (a push), not just editing server env. This is why moving domains means updating GitHub Variables and rebuilding.

**Why this exists:** the server previously built locally, which repeatedly failed (npm hangs, DNS/bridge issues, no network for `next/font/google`). CI builds have full internet and a clean environment, so that entire class of failure is gone. A broken build now fails on GitHub *before* deploying — production keeps running the last good image.

---

## 4. Infrastructure & HTTPS

### The path to HTTPS (and why it's the way it is)

The app serves on `https://sevak.live` (app) and `https://api.sevak.live` (Supabase/Kong), both terminated by **Nginx with Let's Encrypt certificates**.

Key constraints discovered along the way:
- **The router occupies port 80** (its admin panel), so HTTP-01 ACME validation is impossible. → Certificates are issued via **DNS-01** (Cloudflare API), which needs no inbound port 80.
- **Port 443 is forwarded** from the router to the server. That's the only inbound port the app needs.
- **Cloudflare DNS records are grey-cloud (DNS only), not proxied.** An earlier Cloudflare Tunnel setup routed traffic through Amsterdam (~150ms added latency) — rejected. Direct-to-IP with Let's Encrypt keeps traffic in-region.

### Certificate renewal

Certbot with the Cloudflare DNS plugin; credentials in `/root/.secrets/cloudflare.ini` (chmod 600). Renews automatically via systemd timer, no ports needed. Verify: `sudo certbot renew --dry-run`.

### Nginx

Two server blocks (`/etc/nginx/sites-available/pm-app.conf`, `supabase.conf`), both `listen 443 ssl`, proxying to `127.0.0.1:3001` (app) and `127.0.0.1:8000` (Kong). Both carry the WebSocket upgrade headers (`Upgrade`/`Connection`) and `proxy_read_timeout 86400` — **required for realtime chat**. Large-header-buffer settings are also present (a past 502 cause).

---

## 5. Database schema (core)

Hierarchy: **projects → channels → tasks → messages**. Announcements are project-level.

- **projects** — `id, title, description, status, created_by, created_at, updated_at`. `status` is text with a CHECK constraint allowing `active | on_hold | completed | archived`.
- **channels** — `id, project_id, name, position, created_by, …`. Groups tasks within a project (Model A: visible to all project members, not per-channel membership).
- **tasks** — has BOTH `project_id` and `channel_id`. `project_id` was kept when channels were added, so all existing policies/triggers still work; `channel_id` is additive (`ON DELETE SET NULL`).
- **messages** — per-task chat. `reply_to_id` for threaded replies, attachments as object paths.
- **message_reads** — read receipts.
- **announcements** — project-level board (admin-write, member-read).
- **project_members** — `project_id, user_id, role` (admin/member).
- **project_pins** — per-user pins (`user_id, project_id`). Personal; RLS restricts to own rows.
- **profiles** — user profiles; includes `is_super_admin`, `is_primary_admin`, `must_change_password`.
- **push_subscriptions** — `user_id, endpoint, p256dh, auth`.

### Migrations run directly on production (NOT in git)

Schema changes were applied straight to prod Postgres via `psql`. **These SQL files should be saved somewhere versioned** (see Open Items). The major ones:
- Channels: `channels` table + `tasks.channel_id`, RLS, `block_delete_nonempty_channel` trigger, `enforce_task_channel_project` trigger, backfill (one "General" channel per project, existing tasks assigned).
- `project_pins` table + RLS.
- `task-delete-policy`: allow task creator (not just admin) to delete.
- `fix-channel-delete-trigger`: the `block_delete_nonempty_channel` guard was also blocking **project** deletion (cascade). Fixed to allow the delete when the parent project no longer exists (i.e. during a project cascade).

### Testing migrations

Always test on a throwaway container first:
```bash
docker run -d --name pgtest -e POSTGRES_PASSWORD=test postgres:17 && sleep 12
docker cp ~/backups/pg-<newest>.dump pgtest:/tmp/t.dump
docker exec pgtest pg_restore -U postgres -d postgres --no-owner --no-acl /tmp/t.dump
# apply migration to pgtest, verify, THEN apply to supabase-db
docker rm -f pgtest
```
(Restore shows harmless errors about missing roles like `authenticated` — those roles only exist in real Supabase.)

---

## 6. Auth & admin model

- **Accounts are admin-created.** Public signup is disabled — `/signup` redirects to `/login` via Next's server-side `redirect()`. The primary admin creates users, who log in with a default password and are forced to change it on first login.
- **Roles:** `is_primary_admin` (the top account), `is_super_admin` (can create users / grant super-admin), plus per-project `role` (admin/member) in `project_members`.
- **Forced password change:** `must_change_password` on the profile; enforced in **middleware** (server-side, can't be bypassed by the client). Cleared via a server route using the service-role client (a normal user can't clear it themselves because of the guard trigger below).
- **User creation** runs in a **server route** (`/api/admin/create-user`) using the service-role key — never client-side.
- **Project creation is restricted to super admins.** RLS policy `projects_insert_super_admin` (WITH CHECK `created_by = auth.uid() AND current_user_is_super_admin()`) enforces it at the database; the dashboard "New project" button is gated to super admins in the UI. Existing projects created under the old permissive rule are untouched. The creator is still added as project admin via a client-side `project_members` insert in the New Project dialog (no DB trigger does this).

### The privilege-escalation guard (important)

`profiles` has a `guard_privileged_profile_columns` BEFORE-UPDATE trigger that blocks changes to `is_super_admin`, `is_primary_admin`, `must_change_password` unless the caller is a super admin. **This is the real security backstop** — without it, the `profiles_update_own` policy (which allows self-update with no column restriction) would let any user set `is_super_admin = true` on themselves. The trigger closes that at the database, regardless of UI or policy.

---

## 7. Storage

Three buckets:
- **avatars** — PUBLIC. Read via `getPublicUrl`. Profile photos.
- **task-attachments** — PRIVATE. Read via `createSignedUrl`. RLS via `can_access_task()`.
- **announcement-attachments** — PRIVATE. Read via signed URL. Member-read, admin-write.

**Attachments are stored as object PATHS, not full URLs** — URLs are minted at render time via `createSignedUrl`. This is deliberate: it survives host/protocol changes (the old design hardcoded `http://27.116.52.24:8001/…` URLs that broke at HTTPS cutover).

### Project deletion purges files

Deleting a project cascades all DB rows (channels/tasks/messages/announcements/members) via FK `ON DELETE CASCADE` — but **storage files don't cascade**. So project deletion runs through a **server route** (`/api/delete-project`) that: gathers task IDs → purges their attachment folders → purges the project's announcement folder → deletes the project row. File cleanup is best-effort (a storage hiccup doesn't block the delete).

**Note:** files orphaned by deletions *before* this route existed are still in the buckets. A one-time cleanup sweep is an open item.

---

## 8. Push notifications

A separate **push worker** (`worker/index.mjs`, image `pm-app-push-worker`) subscribes to Supabase Realtime `postgres_changes` and fans out web-push notifications via `web-push`.

- **Pattern:** one `.channel().on('INSERT', …)` listener per table (messages, announcements, task assignment, …). Each looks up recipients and calls `sendToUsers()`, **excluding the author** (you never get notified of your own action).
- **VAPID keys:** public key is `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (browser-safe); private key is `VAPID_PRIVATE_KEY` (server-only, in `.env.production`, never `NEXT_PUBLIC_`).
- The worker uses the **service-role client** (bypasses RLS) — correct, since it must read all members and subscriptions.
- Runs with `restart: unless-stopped`, in the same compose file as the app.

### The worker MUST reach Supabase over the internal Docker network

The worker connects to Supabase Realtime for `postgres_changes`. It must do this over the **internal Docker network** (`http://supabase-kong:8000`), NOT the public `https://api.sevak.live` URL. Over the public URL, the realtime websocket goes out through Cloudflare DNS → router → nginx → Kong and the `postgres_changes` stream silently fails to flow back — the worker connects (logs "SUBSCRIBED") but receives no events. Notifications then silently stop while everything else works.

Setup: the worker service is joined to the external `supabase_default` network in `docker-compose.yaml`, and reads `SUPABASE_INTERNAL_URL=http://supabase-kong:8000` (with fallback to the public URL). **This breaks silently whenever the Docker networks are recreated** — e.g. the folder move from `~/Pm-app` to `~/projects/Pm-app` recreated `pm-app_default` and severed the worker's path to Supabase's network. If notifications stop, check this first.

**Diagnosing push:** every `.subscribe()` should carry a status callback (`.subscribe((s) => console.log('worker-messages:', s))`) — a bare `.subscribe()` gives no signal, and the "connected and listening" log is unconditional and meaningless on its own. Watch for `SUBSCRIBED`. To trace a send end-to-end, temporary logs in the message handler (participant/recipient counts) and in `sendToUsers` (subs found) pinpoint whether it's a no-recipients, no-subscription, or delivery failure.

### The service worker owns push display — don't lose it in SW rewrites

`public/sw.js` handles BOTH caching/auto-update AND push. The push flow needs two listeners: a `push` handler that calls `self.registration.showNotification(...)`, and a `notificationclick` handler that focuses/opens the app. **A past SW rewrite for auto-update dropped these**, causing pushes to arrive and vanish (worker sent successfully, no errors anywhere, nothing displayed). Any change to `sw.js` must preserve the push + notificationclick handlers.

**iOS caveat:** web push only works when the PWA is **installed to the home screen**, not in a Safari tab. A solo-member project produces no notifications (author is excluded, no other recipients).

---

## 9. PWA behaviour

- Installable; works offline; auto-updates via a service worker that shows a "new version available" prompt (tap to reload).
- Service worker: network-first for navigation (fresh HTML online), cache-first for hashed assets, never caches API/auth/realtime. Bump `CACHE_NAME` to force-clear its cache.
- **Firefox desktop Linux can't install PWAs** — use Chromium.
- iOS refresh: pull-to-refresh reloads the page; a full update sometimes needs closing/reopening the installed app.

---

## 10. Backup & recovery

- `~/backups/backup.sh` — nightly `pg_dump -Fc` + roles + a RustFS tarball, 14-day local retention, 2am cron.
- **Off-server upload (rclone) was intentionally removed** — it kept failing with AccessDenied and off-site backup wasn't wanted. If you see rclone errors, that line should not be present (`sed -i '/rclone/d' ~/backups/backup.sh`).
- Restore requires **Postgres ≥ 17**.
- The backup log (`~/backups/backup.log`) is not monitored — worth a periodic glance.

**Recovery outline:** restore the newest `pg-*.dump` into a Postgres 17 instance (`pg_restore`), restore roles, untar the RustFS tarball into the storage volume. Test restores were verified during setup.

---

## 11. Gotchas & hard-won lessons

- **`NEXT_PUBLIC_*` are compile-time.** Changing them needs a CI rebuild, not a server env edit.
- **`window.*` only in event handlers.** `window.location.href` at a component's top level crashes the build (`window is not defined` during prerender). Use Next `redirect()` for server-safe redirects; use `window.location.href` only inside click/submit handlers.
- **iOS Safari & `overflow`:** use `overflow-x-hidden` on the scroll container. `overflow-x: clip` and row-level `overflow-hidden` both collapse iOS chat bubbles.
- **Chat scroll:** `flex flex-col-reverse` anchors to the bottom with no scroll-jump — no JS scrolling needed.
- **Hydration & dates:** never render `toLocaleDateString()` with no/`undefined` locale in a server-rendered component — server vs browser locale mismatch breaks hydration. Format manually (month-name array + `getUTC*`). (Root cause was dev machine on Node 20 without full ICU — now on Node 22, but the manual format is kept for robustness.)
- **JSX files must be `.tsx`**, not `.ts` — `<img>`/`<a>` fail to compile in `.ts`.
- **Inline code paste strips `<a`/anchor tags** in this chat tooling — deliver such code as files.
- **Migrations:** always test on a throwaway `postgres:17` restored from a prod dump before applying to production.
- **The channel-delete guard vs project cascade:** `block_delete_nonempty_channel` originally blocked project deletion too. If you add similar "block delete when non-empty" guards, make them allow the cascade case (check whether the parent still exists).
- **Local dev auth is flaky against remote Supabase.** Login can hang (cookie race) or throw "Invalid Refresh Token" (stale cookie). Fixes: login uses `window.location.href` (full navigation); when a stale cookie jams it, **DevTools → Clear site data**. Production is unaffected. A proper fix (local Supabase for dev) is an open item.
- **Deploy command changed** after the folder move: `cd ~/projects/Pm-app && docker compose pull && docker compose up -d`.
- **`docker compose logs` needs to run from the compose directory** (`~/projects/Pm-app`), else "no configuration file provided."
- **The push worker must use the internal Supabase URL** (`http://supabase-kong:8000`), not the public one — see section 8. Breaks silently when Docker networks are recreated.
- **`sw.js` rewrites must keep the push + notificationclick handlers** — see section 8. Losing them makes pushes arrive but never display.
- **Read-receipt "everyone read" is counted from task PARTICIPANTS, not project members.** `recipientCount` in the task drawer must derive from the count of `task_participants` for the task (minus the sender), not `members.length`. Using project members makes the "all read → orange ticks" threshold unreachable once a project has more members than any single task has participants (the reads only ever come from participants). Symptom: ticks never turn orange even though reads are recorded.
- **Realtime regressions cluster and are often silent.** Three broke in one session (worker network split, SW push handler lost, tick threshold) — all "no error anywhere" failures. When something realtime stops (notifications, live chat, ticks), suspect: is the worker on the internal network, does `sw.js` still handle push, and is the count logic comparing the right population.

---

## 12. Known open items

- **Save prod-only SQL migrations into the repo** (e.g. a `migrations/` folder). Channels, pins, the trigger fixes, and policies were applied directly to prod and exist only as loose files — they should be versioned.
- **Orphaned-storage cleanup sweep** — files from project deletions *before* the purge route existed are still in the buckets. Needs a careful dry-run-first script.
- **Local Supabase for dev** — would end the localhost auth flakiness and stop dev testing against live production data.
- **502 on boot** — brief window while Supabase/Kong come up after a reboot; the app boots before they're ready. Harmless (self-heals), but a Kong healthcheck gate would remove it.
- **npm audit** — CI reported a few high-severity advisories; worth reviewing.
- **Node 22 for the asset-management app** too (if on the same box) — after the system Node upgrade, its `node_modules` may want a rebuild.

---

## 13. Quick command reference

```bash
# Deploy
cd ~/projects/Pm-app && docker compose pull && docker compose up -d

# Logs
cd ~/projects/Pm-app && docker compose logs app --tail 50
cd ~/projects/Pm-app && docker compose logs push-worker --tail 20

# DB shell
docker exec -it supabase-db psql -U postgres

# Backup now
cd ~/projects/Pm-app && ~/backups/backup.sh

# Cert renewal test
sudo certbot renew --dry-run

# What image is running
docker inspect pm-app --format '{{.Config.Image}}'
```

---

*Last updated: August 2026 (rev. 2 — added push-worker internal-network requirement, SW push-handler note, read-receipt participant-count fix, super-admin-only project creation). Maintainer: Denish (anandsagardas).*
