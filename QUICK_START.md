# Quick Start: First Publish

## 1. Validate Content

```bash
npm run content:validate
```

## 2. Set Credentials

```bash
export R2_ENDPOINT="https://97dc30e52aaefc6c6d1ddd700aef7e27.r2.cloudflarestorage.com"
export R2_BUCKET="getverba-content-prod"
export R2_ACCESS_KEY_ID="your-key"
export R2_SECRET_ACCESS_KEY="your-secret"
```

Or use `.env.local`:
```bash
cp .env.local.example .env.local
# Edit .env.local with your credentials
source .env.local
```

## 3. Test Publish (Dry Run)

```bash
./scripts/publish-content.sh --dry-run
```

## 4. Publish

```bash
./scripts/publish-content.sh
```

## 5. Verify

```bash
curl https://getverba-content-api.simpumind-apps.workers.dev/v1/workspaces/de/catalog.json
```

Should return JSON with workspace, language, and sections.

## Next Steps

- See `docs/OPERATIONAL_GUIDE.md` for detailed instructions
- See `docs/worker-example.ts` for Worker code reference
- See `docs/content-client-example.ts` for app integration
