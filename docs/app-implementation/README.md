# App Implementation Guide

This directory contains example implementations for integrating the GetVerba content pipeline into your React Native (Expo) app.

## Files

1. **ContentClient.ts** - Updated content client with Manifest support
2. **bootstrapContent.ts** - Single bootstrap entrypoint
3. **AppBootstrap.tsx** - App wrapper component with loading/error states
4. **workspaceStore.ts** - Example workspace store with available workspaces
5. **topicPacksStore.ts** - Example catalog store
6. **PackLibraryScreen.tsx** - Updated library screen using remote catalog
7. **LanguageSwitchUI.tsx** - Examples of hiding language UI when only one workspace

## Implementation Steps

### Step 1: Update ContentClient

Copy `ContentClient.ts` to `src/services/content/ContentClient.ts` and:
- Adjust imports to match your project structure
- Update storage methods (AsyncStorage, SecureStore, etc.) if needed
- Verify BASE_URL matches your Worker endpoint

### Step 2: Create Bootstrap

Copy `bootstrapContent.ts` to `src/services/content/bootstrapContent.ts` and:
- Update store imports to match your actual store paths
- Adjust store method names if they differ
- Add `setCatalogFromRemote()` to your catalog store if missing
- Add `setAvailableWorkspaces()` to your workspace store if missing

### Step 3: Update App Root

Wrap your app with `AppBootstrap` component:

```tsx
import { AppBootstrap } from './components/AppBootstrap';

export default function App() {
  return (
    <AppBootstrap>
      {/* Your existing app content */}
      <NavigationContainer>
        {/* ... */}
      </NavigationContainer>
    </AppBootstrap>
  );
}
```

### Step 4: Update Workspace Store

Add to your workspace store:
- `availableWorkspaces: string[]`
- `setAvailableWorkspaces(workspaces: string[])`
- `canSwitchLanguage(): boolean`

### Step 5: Update Catalog Store

Add to your catalog store:
- `catalog: Catalog | null`
- `setCatalogFromRemote(catalog: Catalog)`

### Step 6: Update Library Screen

Replace any `getCatalogForWorkspace()` calls with:
```tsx
const catalog = useTopicPacksStore((s) => s.catalog);
```

### Step 7: Hide Language UI

In all language switching UI components, add:
```tsx
const canSwitchLanguage = workspaceStore((s) => s.canSwitchLanguage());
if (!canSwitchLanguage) return null;
```

## Acceptance Checks

✅ **Fresh install, online:**
- `/manifest` fetched
- Workspace set to `de`
- Catalog fetched
- Library renders sections from remote catalog

✅ **Only one workspace:**
- No "Add language" button visible
- No language switching UI rows

✅ **Kill network after first run:**
- App loads using cached manifest/catalog (ETag cache)

✅ **Fresh install, offline:**
- Shows "Content unavailable" screen with retry

## Testing

1. **Test online:** Clear app data, launch app, verify content loads
2. **Test offline:** Enable airplane mode, launch app, verify error screen
3. **Test single workspace:** Verify language UI is hidden
4. **Test ETag caching:** Make request, verify 304 response on second request

## Troubleshooting

### "No workspaces available in manifest"
- Check that `/manifest` endpoint returns valid JSON
- Verify manifest has `workspaces` object with at least one entry

### "Workspace not found in manifest"
- Verify `activeWorkspace` in manifest matches a key in `workspaces`
- Check that workspace code matches (e.g., "de" not "de-DE")

### Catalog not rendering
- Verify `setCatalogFromRemote()` is called in bootstrap
- Check that catalog store is properly connected to UI
- Verify catalog structure matches expected format

### Language UI still showing
- Verify `setAvailableWorkspaces()` is called in bootstrap
- Check that `canSwitchLanguage()` returns false when only one workspace
- Ensure all language UI components check `canSwitchLanguage()`

