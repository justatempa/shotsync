English | [简体中文](README.zh-CN.md)

# shotsync

Your own cross-device image & text pool, self-hosted on any server in minutes. Drop a screenshot or photo on one device, grab it on another. No app to install (the phone client is a PWA), no third-party image host — your data lives only as plain files in a local directory on your machine.

## What it is

A small **zero-dependency Node.js server** backing a **PWA gallery**:

- Upload **images** (auto-converted to JPEG + thumbnailed client-side) and **text** snippets.
- View a newest-first feed on any device; tap to view full, **save/download**, or **delete**.
- Mint a **signed, expiring public link** to share one item — without exposing the rest of the pool.
- **Token-gated**: one shared secret unlocks the pool; everything else stays private.
- **30-day transit pool** (auto-deleted by a built-in sweep), not an archive.

## Why

iCloud / AirDrop / network drives / public image hosts are either manual, ecosystem-locked, or route your (possibly work) screenshots through someone else's cloud. shotsync is a self-hosted, free, privacy-respecting take: data only moves between your devices and your own server.

## How it compares (LocalSend, PairDrop, messaging yourself)

The dividing line is **a live transfer vs. a pool that waits**. LocalSend and PairDrop connect two devices that are both awake right now and stream between them. shotsync keeps the item for 30 days, so the sending device can be asleep, on a different network, or in another country by the time you pick it up.

|  | shotsync | [LocalSend](https://localsend.org) | [PairDrop](https://pairdrop.net) |
| --- | --- | --- | --- |
| Both devices online at once | not required | required | required |
| Install | none (PWA in the browser) | an app on every device | none (browser) |
| Across different networks | yes | no — same local network | via a temporary public room |
| Where the bytes go | a folder on your own server | device to device, no server | peer-to-peer, public signalling server |
| Left behind after transfer | 30 days, browsable | nothing | nothing |
| Setup | run one server, ~5 min | install, then open | just open the page |
| Per-item size limit | 25 MB | bounded by disk | bounded by the connection |

**Choose LocalSend if** both devices are on the same Wi-Fi, both in front of you, and the file is large. It is peer-to-peer, has no practical size ceiling, and needs no internet at all.

**Choose PairDrop if** you want zero setup and would rather not run anything. It is the shortest path from nothing to a transferred file.

**Choose shotsync if** you keep sending yourself screenshots and want them still there when you sit back down hours later, on a different machine, on a different network — and you would rather they lived on your own server than on a public image host. It replaces the habit of messaging things to yourself, not AirDrop.

**There are no per-user accounts:** one shared token unlocks the whole pool. See "Security model & limitations" below before deploying.

## Deploy your own (~5 min)

Prereqs: a server (a VPS, a home machine, a NAS — anything that can run Node.js 22+) with Node.js 22+ installed.

```bash
git clone https://github.com/Defiabell/shotsync
cd shotsync
npm install
npm run build

# generate the shared access token — you enter it on each device
openssl rand -hex 24        # generate one, copy it
AUTH_TOKEN=<paste-token> npm start
```

The server listens on `http://0.0.0.0:3000` by default. Open `http://<server-address>:3000` on each device and enter the same token.

### Configuration (environment variables)

| Variable | Default | Meaning |
| --- | --- | --- |
| `AUTH_TOKEN` | — | **Required.** The shared passphrase for the pool. |
| `PORT` | `3000` | Listen port. |
| `DATA_DIR` | `./data` | Where uploaded files live (`full/…` originals, `thumb/…` thumbnails, plus one small `.meta.json` per file). Point this at your disk/NAS mount. |
| `RETENTION_DAYS` | `30` | Items older than this are deleted by an hourly sweep. `0` disables auto-cleanup. |
| `DEMO_MODE` | off | `1` makes reads public (list/view) while writes still require the token — for a read-only showcase pool. |

Put it behind nginx/Caddy/your reverse proxy for HTTPS when exposing it beyond localhost; the app itself speaks plain HTTP.

### 30-day retention

Built in: the server sweeps expired items every hour (`RETENTION_DAYS`, default 30). No cron or external rule to configure. Restarting the server never loses data — everything is on disk under `DATA_DIR`.

## Using it

The UI labels are in Chinese; the English in parentheses below maps each step to the button you'll see.

### 1. First time, on each device
1. Open your server URL (e.g. `http://192.168.1.10:3000` or your HTTPS domain).
2. Enter your `AUTH_TOKEN` when prompted — it's saved in `localStorage`, so you won't be asked again on that device.
3. (Optional) In Safari: **Share → Add to Home Screen** to install it as a PWA. It then runs full-screen like an app.

The gallery shows every item newest-first and auto-refreshes every ~20 s, so anything uploaded from another device appears within seconds.

### 2. Add things to the pool
- **Image** — tap **`+ 图片`** (Add image): pick from photos or camera. It's converted to JPEG and thumbnailed in your browser, then uploaded.
- **Text** — tap **`✎ 文字`** (Text), paste/type a snippet, then **`发送`** (Send). It becomes a text card — a cross-device clipboard.
- **Mac screenshots, automatically** — install the [Mac menu-bar app](mac/README.md): every screenshot uploads on its own.
- **iOS share sheet** — set up the [Shortcut](shortcut/README.md) to push an image from any app's share sheet.

### 3. Open one item (tap it)
Tap any thumbnail/card to open it full-screen, then:
- **`保存` / `复制`** (Save / Copy) — image: save to Photos (mobile) or download (desktop); text: copy to clipboard.
- **`分享`** (Share) — mint a **7-day public link** to just that item, copied to your clipboard. Anyone with the link can view that one item; the rest of the pool stays private.
- **`删除`** (Delete) — remove this item.
- **`关闭`** (Close) — back to the gallery.

### 4. Delete many at once
1. Tap **`选择`** (Select) to enter selection mode.
2. Tap items to check them (blue outline); tap again to uncheck.
3. Tap **`删除选中 (N)`** (Delete selected) → confirm. Or **`取消`** (Cancel) to leave without deleting.

### 5. See your token, set up another device, or log out
Tap **`⚙`** in the top bar. The panel shows this pool's URL and the token this device holds — masked by default, because the Mac app auto-uploads screenshots and a plaintext token on screen is one ⌘⇧3 away from landing in the pool.
- **`显示`** (Show) toggles the full token; **`复制`** (Copy) puts it on the clipboard for pasting into another device.
- **`退出登录`** (Log out) forgets the token on this device and returns to the token prompt. Nothing changes server-side; the same token still works elsewhere.

## Security model & limitations

- **Single shared token.** Anyone with the URL **and** token can view/upload/delete. This is a single-user / trusted-circle tool, not multi-tenant — there are no per-user accounts and no way to "switch" tokens on one pool; a second pool is a second data dir / second deployment. Restart with a new `AUTH_TOKEN` to rotate — note this also invalidates all live share links, since the token is the link signing key.
- **Share links are public** until they expire (7 days): anyone with the link can see that one item.
- **Transit pool, not an archive.** Items auto-delete after 30 days by design (`RETENTION_DAYS`).
- **The UI is currently in Chinese.** i18n PRs welcome.
- The server stores received bytes as-is (no server-side image processing); format conversion and thumbnails happen on the client.
- Data is stored as plain files readable by the server's OS user — protect that account and the disk like you would any other. There is no application-layer encryption; put HTTPS in front when exposing the service.

## Development

```bash
npm install       # dev deps only; the server itself has zero runtime dependencies
npm test          # Vitest (node) — full suite
npx tsc --noEmit  # type-check
npm run dev       # run from source with watch (tsx); needs AUTH_TOKEN in the env
npm run build     # compile to dist/
npm start         # run the compiled server
```

## License

[MIT](LICENSE)
