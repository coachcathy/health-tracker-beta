# Health Tracker Beta

Standalone Health Tracker + right-side Scheduler extracted from the current Life Coach build for a 10–20 person beta.

## Architecture
- Cloudflare Worker + static assets
- Cloudflare Access protects the private beta
- Cloudflare D1 stores persistent user data
- Each participant gets a permanent internal UUID; their email/login identity is mapped separately
- localStorage is only a browser cache/fallback, not the authoritative record
- Database migrations live in Git so beta history can be carried forward into the product

## Included now
- 7 daily health check-offs
- Take-Off Tuesday
- date navigation and backfilling
- food diary + protein/carbs/fat
- Wednesday weigh-ins and weekly change
- editable weight corrections
- full health log
- preloaded recipe library
- editable weekly scheduler in the right panel
- personal data export
- beta feedback endpoint

## First setup
1. `npm install`
2. `npx wrangler login`
3. `npx wrangler d1 create health-tracker-beta-db`
4. Put the returned `database_id` into `wrangler.jsonc`
5. `npm run db:migrate:remote`
6. Put your email in `ADMIN_EMAILS`
7. `npm run dev`
8. `npm run deploy`
9. In Cloudflare Workers & Pages, enable Cloudflare Access on this Worker and allow only the beta testers' email addresses.

## Start a brand-new Git repo
```bash
git init
git add .
git commit -m "Initial Health Tracker beta"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/health-tracker-beta.git
git push -u origin main
```

Cloudflare D1 migration files are committed to the repo. That is the mechanism we will use to change the database later without wiping tester data.


## v0.1.1 Access identity fix
Cloudflare Workers with Static Assets do not pass `ctx.access` through the internal asset router to the user Worker. The API now falls back to the authenticated `CF_Authorization` cookie and Cloudflare Access `/cdn-cgi/access/get-identity` endpoint so the signed-in tester can be mapped to a permanent D1 user record.
