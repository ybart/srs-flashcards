# Deployment

The app is a static PWA (client-side SQLite WASM). The entire deployable is the
`public/` folder, served as static files.

- **Host:** Hetzner box `cloud.ilyba.fr` (`157.180.114.209` / `2a01:4f9:c014:6ff::1`), managed with **YunoHost**.
- **Domain:** `srs-flashcards.ilyba.fr`
- **DNS:** Infomaniak
- **Web root:** `/var/www/my_webapp/www/` (owned by `my_webapp:www-data`)

YunoHost manages nginx and Let's Encrypt, so there are no hand-written vhost
files — only two small config includes for this app (see *Nginx config* below).

## 1. DNS (Infomaniak)

`srs-flashcards.ilyba.fr` is a **CNAME → `cloud.ilyba.fr.`** (so it inherits the
host's A/AAAA and follows any future IP change). Set it in
Infomaniak → Domains → ilyba.fr → DNS zone, then verify:

```
dig +short srs-flashcards.ilyba.fr        # -> cloud.ilyba.fr. -> 157.180.114.209
```

## 2. Register the domain + certificate (once)

Run on the server. Our DNS is an intentional CNAME, so the built-in DNS
diagnosis may warn about missing A/MX records — that's expected and harmless.

```
sudo yunohost domain add srs-flashcards.ilyba.fr
sudo yunohost domain cert install srs-flashcards.ilyba.fr   # add --no-checks if the CNAME trips diagnosis
```

## 3. Install the static web app (once)

```
sudo yunohost app install my_webapp
```

Answers: domain `srs-flashcards.ilyba.fr`, path `/`, access **visitors** (public),
PHP **none**, no database.

## 4. Nginx config (once)

YunoHost includes every `*.conf` in `/etc/nginx/conf.d/<domain>.d/`, and those
files survive app upgrades. Two are needed:

### a) Cross-origin isolation headers

Required for persistent SQLite storage (OPFS / SharedArrayBuffer).

`/etc/nginx/conf.d/srs-flashcards.ilyba.fr.d/coop-coep.conf`:

```
add_header Cross-Origin-Embedder-Policy "require-corp" always;
add_header Cross-Origin-Opener-Policy   "same-origin" always;
add_header Cross-Origin-Resource-Policy "same-origin" always;
```

### b) `.mjs` MIME type

nginx's default `mime.types` serves `.mjs` as `application/octet-stream`, which
browsers reject for module scripts ("Importing a module script failed" — the
worker imports `js/sqlite3/sqlite3.mjs`). This override serves `.mjs` as
JavaScript. It re-declares the COOP/COEP headers because an nginx `location`
with its own `add_header` stops inheriting the server-level ones.

`/etc/nginx/conf.d/srs-flashcards.ilyba.fr.d/mjs.conf`:

```
location ~ \.mjs$ {
    root /var/www/my_webapp/www;
    default_type text/javascript;
    add_header Cross-Origin-Embedder-Policy "require-corp" always;
    add_header Cross-Origin-Opener-Policy   "same-origin" always;
    add_header Cross-Origin-Resource-Policy "same-origin" always;
}
```

### c) The install page in the reader's language

`install.html` is prose outside the app — no Stimulus, no catalogue — so it is
translated by having a whole second file, `install.fr.html`. Both link the same
`/css/install.css`, so only the words are duplicated. Which one a visitor gets is
nginx's decision, taken from the `Accept-Language` header the browser sends.

The file is kept in the repo at `deploy/nginx/language.conf`, so what is on the
server can be compared with what is in git. To install it:

```
scp deploy/nginx/language.conf ybart@cloud.ilyba.fr:/tmp/language.conf
ssh -t ybart@cloud.ilyba.fr 'sudo install -o root -g root -m 644 /tmp/language.conf \
  /etc/nginx/conf.d/srs-flashcards.ilyba.fr.d/language.conf && sudo nginx -t \
  && sudo systemctl reload nginx && rm /tmp/language.conf'
```

`nginx -t` runs before the reload, so a config that does not parse never reaches a
running server. To undo it, delete the file and reload:

```
ssh -t ybart@cloud.ilyba.fr 'sudo rm /etc/nginx/conf.d/srs-flashcards.ilyba.fr.d/language.conf \
  && sudo nginx -t && sudo systemctl reload nginx'
```

`Vary: Accept-Language` matters: without it a cache — the browser's, or anything
in front of nginx — serves whichever language it saw first to everybody. As in
`mjs.conf`, the COOP/COEP headers are re-declared because a `location` with its
own `add_header` stops inheriting the server-level ones.

**No `map`, deliberately.** Reading `Accept-Language` into a variable with `map`
is the usual way and cannot be done here: the domain's `.d/*.conf` is included at
line 51 of `/etc/nginx/conf.d/<domain>.conf`, *inside* the `server` block, and
`map` is only valid at `http` level — `nginx -t` rejects it. The choice is made
with `set` and `if` inside the location, which stays within the rewrite-module
directives, the part of `if` that behaves. Only the browser's *first* language tag
is honoured: nginx cannot weigh q-values without contortions, and matching `fr`
anywhere in the header would serve French to a browser asking for
`en-GB,fr;q=0.8`, which prefers English.

The two curl checks below are the proof it works, and they are worth running: the
config is the one thing here that could not be tested before it shipped.

`/install.fr.html` stays reachable directly, which is what makes it testable:

```
curl -s -H 'Accept-Language: fr-FR,fr;q=0.9' https://srs-flashcards.ilyba.fr/install.html | grep -o '<html lang="[a-z]*"'
curl -s -H 'Accept-Language: en-GB,en;q=0.9' https://srs-flashcards.ilyba.fr/install.html | grep -o '<html lang="[a-z]*"'
```

The same pattern would serve a translated `manifest.json`, and is the only way
the app's name is right before the app has ever run — but the manifest carries
nothing translatable today (a name, and no description), so there is nothing to
negotiate yet.

Apply:

```
sudo nginx -t && sudo systemctl reload nginx
```

## 5. Deploy the app

From the repo (any machine with SSH access to the host):

```
./bin/deploy
```

`bin/deploy` deploys `public/` from the **last pushed commit** (`origin/main`) —
never the working tree — and warns if there are uncommitted or unpushed changes.
It stages the tree with `git archive`, rsyncs to a temp dir, then `sudo`-installs
into the web root and fixes ownership.

### Releasing an update to installed PWAs

`public/version.json` is the single source of truth for the release version.
Bump it when you want installed clients to pick up new files:

- `bin/deploy` stamps that version into `sw.js`'s `CACHE_VERSION`, so each
  release ships a byte-changed service worker.
- A client's **Check for Updates** menu item compares `version.json` to its
  stored version, calls `registration.update()`, and reloads once the new
  worker takes control (`controllerchange`). The new worker's `activate`
  handler purges old caches and re-precaches — no force-quit needed.
- The user's OPFS/IndexedDB database is never touched by this.

## 6. Verify

```
curl -sI https://srs-flashcards.ilyba.fr/ | grep -iE 'HTTP/|cross-origin'
curl -s -o /dev/null -w '%{content_type}\n' https://srs-flashcards.ilyba.fr/js/sqlite3/sqlite3.mjs   # -> text/javascript
```

Expect `200`, the three `Cross-Origin-*` headers, and `.mjs` as `text/javascript`.

> **Service worker cache:** `sw.js` precaches assets and serves cache-first, so
> installed clients keep serving cached files until a new release is picked up.
> Bump `public/version.json` (see *Releasing an update* above) — don't hand-edit
> `CACHE_VERSION`, `bin/deploy` stamps it from `version.json`.
