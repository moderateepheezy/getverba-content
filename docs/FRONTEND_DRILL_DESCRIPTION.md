# Frontend: Using Drill Descriptions

## Overview

The `description` field tells users what they will learn from a drill group. It's localized and always available.

## API Endpoint

```
GET /v1/workspaces/{ws}/drills
```

Returns a response with `drillGroups` array (see [DRILLS_V4_BE_SHAPING.md](./content-pipeline/DRILLS_V4_BE_SHAPING.md) for full spec).

## Field Location

The `description` is on the **DrillGroup** object, not on individual tiers.

```json
{
  "drillGroups": [
    {
      "id": "case_endings_akkusativ",
      "kind": "drill_group",
      "title": "Akkusativ Case Endings",
      "description": "Practice accusative case endings (den, die, das, einen, eine)",
      "description_i18n": {
        "en": "Practice accusative case endings (den, die, das, einen, eine)",
        "de": "Übe Akkusativ-Endungen (den, die, das, einen, eine)"
      },
      "tiers": [ ... ]
    }
  ]
}
```

## Usage

### 1. Read the Description

```typescript
// From the DrillGroup object
const description = drillGroup.description; // Fallback (English)
const description_i18n = drillGroup.description_i18n; // Localized versions
```

### 2. Localization

Use `description_i18n` if available, fall back to `description`:

```typescript
function getDescription(drillGroup: DrillGroup, locale: string): string {
  return drillGroup.description_i18n?.[locale] 
    ?? drillGroup.description_i18n?.en 
    ?? drillGroup.description;
}
```

### 3. Display

Show the description in your drill group UI (e.g., below the title, in a tooltip, or in a details panel).

## Example

```typescript
interface DrillGroup {
  id: string;
  kind: "drill_group";
  title: string;
  description: string; // Required, always present
  description_i18n?: Record<string, string>; // Optional, localized
  tiers: DrillTier[];
  // ... other fields
}

// Usage
drillGroups.forEach(group => {
  const desc = getDescription(group, userLocale);
  renderDrillGroup({
    title: group.title,
    description: desc, // What the user will learn
    tiers: group.tiers
  });
});
```

## Notes

- ✅ `description` is **always present** (required field)
- ✅ `description_i18n` is **optional** (may not exist for all locales)
- ✅ Always fall back to `description` if `description_i18n` is missing
- ❌ Do **not** read description from `DrillTier` objects (they don't have it)
- ❌ Do **not** read from individual drill files (use the shaped API)

