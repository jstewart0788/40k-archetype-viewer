# Deployment

The site is deployed to GitHub Pages from `main` via the `gh-pages` branch. This doc is for someone who already cloned the repo and wants to update or fork it — not for setting up a brand-new repo from scratch.

## Updating the deployed site

```bash
npm run deploy
```

That alias runs `npm run predeploy` (`pytest tests/` + `vite build`) and then `gh-pages -d dist`, which pushes the build artifact to the `gh-pages` branch on the configured remote. Tests must pass; the build must succeed; otherwise nothing ships.

If you also want `main` updated alongside the deploy:

```bash
git push origin main
```

The deploy and the main branch are independent — `npm run deploy` does not push `main` for you.

## Local development

```bash
npm install     # first time only
npm run dev     # vite dev server on http://localhost:5173 (or first free port)
```

Tests:

```bash
npm run test:data    # pytest against public/tournamentData.json
```

## Forking to a different repo name

If you fork to a repository whose name is not `40k-archetype-viewer`, the GitHub Pages base path needs to match. Update two places:

**`vite.config.js`:**
```js
base: '/YOUR-REPO-NAME/',
```

**`src/App.jsx`:**
```jsx
<Router basename="/YOUR-REPO-NAME">
```

Both need the leading slash, both need to match the repository name exactly.

## Enabling GitHub Pages on a fresh fork

1. Repo → Settings → Pages
2. Source: deploy from a branch
3. Branch: `gh-pages` / root
4. After the first `npm run deploy`, the site is live at `https://YOUR_USERNAME.github.io/YOUR-REPO-NAME/`

## Custom domain

1. Drop a `CNAME` file in `public/` with your domain
2. Configure DNS per the [GitHub Pages custom-domain docs](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site)
3. Set `base: '/'` in `vite.config.js` and `basename=""` in `src/App.jsx`

## Troubleshooting

**Blank page after deploy:** the `base` in `vite.config.js` and the `basename` in `src/App.jsx` are out of sync with the repo name.

**404 on page refresh:** GitHub Pages doesn't natively rewrite client-side routes. The `public/.nojekyll` file disables Jekyll preprocessing; for a deeper fix, add a `public/404.html` that redirects to `index.html` with the path preserved as a query parameter.

**Build errors:** run `npm ci` to reinstall from `package-lock.json`. Node 20+ is required (see `engines` in `package.json`).

## What gets deployed

`vite build` reads everything in `public/` and bundles whatever is imported from `src/`. The largest static asset is `public/tournamentData.json` (~11 MB), which is fetched at runtime rather than bundled into the JS chunk — see `src/data/TournamentDataContext.jsx` for the loading flow.
