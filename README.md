# ScriptForge

My YouTube HQ — every video idea from first thought to published video.

Open `index.html` (or host the folder on GitHub Pages / Firebase Hosting). Password: `brad` (set in `js/config.js`).

## Pipeline

| Tab | What it's for |
|---|---|
| **Hub** | Counts for everything (banked, awaiting vetting, approved, skeletons ready, in production, published), the pipeline bar, **On Deck** (the ideas you're working on now) and the **production queue**. |
| **Idea Bank** | Dump every idea. Hit Enter and it's saved. Add `#tags` inline. Search, filter, star. |
| **Vetting** | Run each idea through a yes/no checklist (you can edit it in ⚙ Settings). Approve, park, or reject. |
| **Skeletons** | For approved ideas: title, thumbnail mockup (with live YouTube preview), hook, stakes, outline, payoff, target viewer. When the required parts are filled in, approve it for production. |
| **Production** | Title options + thumbnail mockups (pick the winners), the But/Therefore train, hook & resolution, the script (word count + runtime estimate), and a production checklist through to publishing. |
| **Playbook** | The script fundamentals, condensed. The full version is in [`docs/script-fundamentals.md`](docs/script-fundamentals.md). |

## Data & Firebase

Until Firebase is configured, everything is saved in the browser you're using (use ⚙ Settings → Export backup to move it).

To sync across devices:

1. In the [Firebase console](https://console.firebase.google.com/), create a project and add a **Web app**.
2. Create a **Firestore Database**.
3. Paste the web app config into `js/config.js` (`SF_FIREBASE_CONFIG`).
4. Reload. The top-right indicator turns green ("Synced"). If the database is empty, the ideas already in this browser are uploaded automatically.

Data lives in two places: the `ideas` collection (one document per idea) and `meta/settings` (your vetting checklist).

**Heads-up on security:** the `brad` password is only checked in the browser. It doesn't protect the database. For Firestore to work without a login, the rules have to allow reads and writes, which means anyone who has your config could read or change your ideas. That's fine for a private idea board. If you want it properly locked down later, add Firebase Authentication and use rules like `allow read, write: if request.auth != null;`.

## Files

```
index.html                  app shell + lock screen
css/styles.css              styles
js/config.js                password + Firebase config
js/store.js                 data layer (localStorage + Firestore)
js/app.js                   all views and interactions
docs/script-fundamentals.md the original 8-step script framework
```
