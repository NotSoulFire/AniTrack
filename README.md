# AniTrack

A personal anime and manga tracker. Add titles manually, attach cover photos, and track watched episodes and read chapters. Completion is calculated from the counts and totals.

## Requirements

- Node.js 18 or newer
- Internet access for the Chart.js CDN

## Run locally

From this folder, install the dependencies and start the server:

```sh
npm install
npm start
```

Open http://localhost:3000 in your browser.

The app creates `database.db` and `public/uploads/` in this folder the first time the server starts. Your library and uploaded photos are stored locally and intentionally excluded from Git. Photos can be JPEG, PNG, or WebP files up to 3 MB; you can replace or remove a photo while editing an item.

## GitHub contents

Commit the source files and `package-lock.json`. Do not commit `node_modules/`, `database.db`, or uploaded photos; these are listed in `.gitignore`.
