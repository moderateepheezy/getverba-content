# Quick Start: First Publish

## Current Status

✅ **Content validated** - All 6 JSON files are valid  
✅ **Worker is live** - All endpoints working  
✅ **Content published** - All files uploaded to R2 with proper headers  
✅ **Credentials configured** - Stored in .env.local (gitignored)

## 1. Validate Content

```bash
npm run content:validate
```

**Status:** ✅ Already validated - All files are valid

## 2. Set Credentials

**✅ Credentials are already configured!**

The publish script automatically loads credentials from `.env.local` (which is gitignored).

**No action needed** - Just run:
```bash
./scripts/publish-content.sh --dry-run
./scripts/publish-content.sh
```

**Manual override (if needed):**
```bash
# Option A: Load from .env.local manually
source scripts/load-env.sh

# Option B: Export manually
export R2_ENDPOINT="https://97dc30e52aaefc6c6d1ddd700aef7e27.r2.cloudflarestorage.com"
export R2_BUCKET="getverba-content-prod"
export R2_ACCESS_KEY_ID="your-key"
export R2_SECRET_ACCESS_KEY="your-secret"
```

**Note:** `.env.local` is already created with your credentials and is gitignored.

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

**Status:** ✅ All endpoints working (catalog, indexes, and packs)

Or run the full verification:
```bash
npm run content:verify
```

## Next Steps

- See `docs/OPERATIONAL_GUIDE.md` for detailed instructions
- See `docs/worker-example.ts` for Worker code reference
- See `docs/content-client-example.ts` for app integration
