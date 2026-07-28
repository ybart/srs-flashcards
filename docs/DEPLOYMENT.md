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

## 6. Verify

```
curl -sI https://srs-flashcards.ilyba.fr/ | grep -iE 'HTTP/|cross-origin'
curl -s -o /dev/null -w '%{content_type}\n' https://srs-flashcards.ilyba.fr/js/sqlite3/sqlite3.mjs   # -> text/javascript
```

Expect `200`, the three `Cross-Origin-*` headers, and `.mjs` as `text/javascript`.

> **Service worker cache:** `sw.js` precaches assets, so a plain browser refresh
> can keep serving stale files after a deploy. Fully relaunch the app (or bump
> `CACHE_VERSION` in `public/sw.js`) to pick up changes.
