# Explainers

Isometric, self-narrating explainers. Each topic is a static site: HTML, canvas 2D, and plain JS. No build step and no framework.

A vehicle carries real state along the roads. Each stop is one step of the system. The numbers come from a small model in that topic's `js/model.js`, and the About panel says which of them are computed, assumed, or faked.

## Explainers

| Town | What it teaches | Path |
|---|---|---|
| Decision Depot | How Jev (TypeSafe System One) answers one decision: shared state, Choice, Score, and Noul in parallel, then a code-owned branch | [`jev/`](jev/) |

## GitHub Pages

This repo is meant to be published from the **root** of the `main` branch, so the landing page and each town keep their paths:

- https://shisa25.github.io/explainers/
- https://shisa25.github.io/explainers/jev/

Enable it once, in the GitHub repo settings: **Settings → Pages → Build and deployment → Deploy from a branch → `main` → `/` (root)**. Save. The first deploy can take a minute. A `.nojekyll` file is in the root so Pages serves the files as they are.

If that toggle is already on for `main` and `/`, merging this branch is enough. If Pages is still pointed at a `docs/` folder, or at GitHub Actions, switch it to branch `main` and folder `/`.
