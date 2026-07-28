# Marketing plan (poor-man edition)

No budget, little time. Everything here is free and time-boxed.

**App:** https://srs-flashcards.ilyba.fr/
**Edge:** a free, offline, install-anywhere PWA for JLPT kanji & vocabulary —
simpler than Anki, no account, no ads, no app-store friction.

**Positioning (reuse everywhere):**
> A free, offline flashcard app for JLPT kanji & vocabulary — no account,
> no ads, installs like a native app.

---

## Week 1 — quick wins (a few hours total)

1. Launch posts where JLPT learners already are, framed as *"I built a free
   tool"* (not an ad): r/LearnJapanese (respect the rules — use the weekly
   resource/question thread), r/JLPT, r/languagelearning, r/PWA, "Show HN",
   and a Product Hunt launch.
2. Get listed in PWA directories (free, permanent backlinks + SEO):
   Appscope, findpwa.com, progressier's directory.
3. Record one 20–30s screen capture of the study loop (question → flip →
   grade). Reuse it in every post.

## Ongoing engine (~1 hr/week)

- Build-in-public on X/Bluesky with `#LearnJapanese #JLPT #日本語`: progress,
  a card animation, a "did you know" kanji fact. Consistency > volume.
- YouTube Shorts / TikTok: the same screen-capture clips + a kanji tip. This
  niche over-indexes on short video.
- Answer, don't advertise: when someone asks "best free JLPT flashcard app?"
  on Reddit/Discord (Refold, "The Moe Way", WaniKani forums), reply helpfully
  and mention it. Converts far better than launch spam.

## Low-effort SEO (compounds)

- A simple landing page targeting long-tail: "free JLPT N5 kanji flashcards
  offline", "Anki alternative for Japanese".
- Email 3–5 Japanese-learning bloggers to be added to "best free JLPT app"
  listicles. One good backlink beats weeks of posting.

## Retention & loops (cheaper than acquisition)

- Add a Share button (export/PWA makes recommending frictionless).
- Time the donate toast *after* a good study session, not on first open.
- Track day-7 retention and installs; fix the leaky bucket before scaling.

**If you only do 3 things:** Product Hunt + Show HN, PWA-directory listings,
one short video/week in the JLPT tag.

---

# Building a Bluesky community (introvert-friendly)

You don't need to be loud or post constantly. In a narrow niche, quiet and
consistent beats loud and sporadic.

**Principles**
- Let the *content* be loud, not you. Post useful things (a kanji, a tip) that
  stand alone — no "look at me", no hard sell.
- Reply > broadcast. Thoughtful replies to others in the JLPT / 日本語 community
  are lower-pressure than original posts and build real relationships. This is
  where quiet people win.
- Consistency over volume. 2–3 posts/week is plenty.
- Batch it. Write a week of posts in one 20-min sitting and schedule them, so
  there's no daily "must post" pressure.

**A low-effort content engine: Kanji of the Day**
You already have a JLPT kanji/vocabulary database — turn it into content:
- One post/day: a kanji + reading + meaning + a short example. Zero invention
  required; it comes straight from your data.
- It's genuinely useful (people follow "X of the day" accounts), on-brand, and
  quietly links to the app from the profile.
- It can be semi- or fully-automated: a script generates the week's posts (or
  posts directly via the Bluesky API). The habit becomes a cron job, not a
  personality change.

**One-time setup (~30 min)**
- Bio = the one-liner + app link. Pin the 20–30s demo clip.
- Join langlearn/JLPT starter packs; follow the relevant custom feeds so you
  show up in the conversation.
- Follow 20–30 active JLPT learners/teachers.

**Weekly rhythm (~15 min)**
- Mon: schedule the week's Kanji-of-the-Day (from the generator).
- Midweek: 2–3 genuine replies to others' posts.
- Fri: one optional "build in public" note if you shipped something.

---

# Talking about it offline (introvert-friendly)

You don't have to pitch. Two low-pressure moves do most of the work:

**1. Let a QR card do the talking.** Make a business-card-sized card (or a
sticker) with a QR code to https://srs-flashcards.ilyba.fr/ and the one-liner.
When Japanese study comes up, hand it over instead of explaining: "I made this,
might help." No speech required — ideal if you'd rather not hold the floor.

**2. Demo, don't describe.** Pull it up on your phone and let someone try one
card for 15 seconds. The app sells itself better than a sentence can.

**Keep one line ready** so you never improvise:
> "It's a free flashcard app I made for JLPT kanji — works offline, no account.
> Want the link?"

**Where it comes up naturally** (no cold approaches needed):
- Language-exchange meetups and Japanese conversation groups
- A class, tutor, or university Japanese club
- Japan-culture events, or friends who mention studying Japanese

The whole tactic is "be ready when it comes up", not "bring it up". Keep a few
QR cards in your wallet and let conversations do the rest.

---

# Draft launch posts (paste-ready)

> Tone: humble, helpful, "made this for myself, sharing in case it helps."
> Swap in real screenshots/GIF where noted. Post from an account with some
> history, and follow each community's self-promotion rules.

## Reddit — r/LearnJapanese (use the weekly resources thread)

**Body:**
I made a free, offline flashcard app for JLPT kanji & vocabulary and figured
I'd share it here.

It's a web app (PWA) — you open it once and can "Add to Home Screen" to use it
like a native app, fully offline. No account, no ads, no signup. It uses a
spaced-repetition schedule (SRS) and ships with JLPT kanji/vocabulary sets.

Link: https://srs-flashcards.ilyba.fr/

It's still early/in development, so I'd genuinely appreciate feedback —
especially on the study flow and what's missing vs the tools you use now.
Your progress is stored locally on your device and you can export/import it as
a file for backup.

## Reddit — r/PWA

**Title:** Built an offline JLPT flashcard PWA (client-side SQLite via WASM, OPFS)

**Body:**
A spaced-repetition flashcard app for learning Japanese, built as a PWA. Runs
fully offline after first load — SQLite compiled to WASM, data persisted in
OPFS, cross-origin isolation headers for storage, and a service worker that
precaches the app shell. No backend; the whole thing is static files.

Live: https://srs-flashcards.ilyba.fr/

Happy to answer anything about the OPFS/SQLite-WASM setup or the offline
strategy. Feedback on the update flow especially welcome.

## Hacker News — Show HN

**Title:** Show HN: Offline JLPT flashcards – a free PWA with client-side SQLite

**Body:**
I wanted an Anki-simpler way to drill JLPT kanji and vocabulary that works on
my phone with no account and no internet, so I built one as a PWA.

It runs entirely client-side: SQLite compiled to WASM, data in OPFS, a service
worker for full offline use, and a spaced-repetition schedule. No backend — it
deploys as static files. You can export/import your progress as a SQLite file.

Link: https://srs-flashcards.ilyba.fr/

It's early and I'm actively working on it. Feedback on the SRS scheduling and
the offline/update mechanics is very welcome.

## Product Hunt

**Tagline (60 chars max):**
Free offline JLPT flashcards — no account, installs like an app

**Description:**
SRS Flashcards is a free, offline-first flashcard app for learning Japanese
kanji and vocabulary for the JLPT. Install it from the browser (PWA), study
anywhere with no internet, and keep your progress on-device with export/import
for backup. No account, no ads. Spaced repetition built in.

**Maker's first comment:**
Hey PH! I built this because I wanted a dead-simple, offline way to drill JLPT
kanji/vocab on my phone without an account or subscription. It's a PWA — SQLite
runs in your browser, everything is stored locally, and it works fully offline
after the first load. It's still early and I'm iterating fast, so I'd love your
feedback on the study flow and what would make you switch from your current
tool. Thanks for taking a look!

## X / Bluesky (short)

Built a free, offline flashcard app for JLPT kanji & vocab 🇯🇵
- installs like a native app (PWA)
- works with no internet
- no account, no ads
- spaced repetition built in

Try it: https://srs-flashcards.ilyba.fr/
#LearnJapanese #JLPT #日本語
