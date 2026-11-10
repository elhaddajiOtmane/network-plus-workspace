# Network+ Certification Workspace

N10-009 study workspace with 540 questions, practice across all five domains, six timed exams, explanations, bookmarks, missed-question review and browser-local progress.

## Run locally

Requires Node.js 22 or later. No dependencies or build step are needed.

```sh
npm start
```

Open the URL printed by the server. Use HTTP on localhost or HTTPS when hosted; ES modules and JSON require a web server.

## Verify

```sh
npm test
mkdir -p evidence
npm run validate
```

## Deploy to Vercel

Import this GitHub repository into Vercel. The included `vercel.json` selects the Other framework preset, no build command, and `dist` as the output directory. No environment variables are required.

## Progress

Progress is stored in the current browser and site address. Before moving from the original site to Vercel, open **Progress & backup**, export your progress, then import it on the new site.

## Structure

- `dist/`: complete static application, question bank, and locally served licensed fonts.
- `tests/`: scoring, filtering, persistence and rendering tests.
- `scripts/`: local server and source validation.

Practice scores are study feedback, not official certification scores. The question bank and explanations are preserved from the existing workspace.
