# Frontend: Using Drill Descriptions and Categories

## Overview

The drill API provides structured drill groups with categories and tiers. Titles and category names are in workspace language only (no i18n), while descriptions and tier titles support i18n.

## API Endpoint

```
GET /v1/workspaces/{ws}/drills
```

Returns a response with `drillGroups` array (see [DRILLS_V4_BE_SHAPING.md](./content-pipeline/DRILLS_V4_BE_SHAPING.md) for full spec).

## Structure

The response has a nested structure:

```
DrillGroup
└── Categories (loopType variants: Pattern, Pairs, Slot, etc.)
    └── Tiers (intensity/progression levels)
```

## Field Locations

### DrillGroup Fields

- `title`: Workspace language only (no i18n) - e.g., "Akkusativ-Endungen" for German workspace
- `description`: Workspace language (from `description_i18n[workspaceLang]` or fallback)
- `description_i18n`: Optional i18n object for descriptions

### DrillCategory Fields

- `category`: Workspace language only (no i18n) - e.g., "Muster" for German workspace
- `loopType`: Raw loopType value for programmatic use (e.g., "pattern_switch")

### DrillTier Fields

- `title`: Unique, descriptive title (NOT repeating drill group title) - supports i18n
- `title_i18n`: Optional i18n object for tier titles
- `description`: What user learns in this tier - supports i18n
- `description_i18n`: Optional i18n object for tier descriptions

## Usage

### 1. Read the Description

```typescript
// From the DrillGroup object
const description = drillGroup.description; // Workspace language
const description_i18n = drillGroup.description_i18n; // Localized versions
```

### 2. Iterate Categories and Tiers

```typescript
drillGroups.forEach(group => {
  // Group title (workspace language only)
  const groupTitle = group.title; // e.g., "Akkusativ-Endungen"
  
  // Group description (use i18n)
  const groupDesc = getDescription(group, userLocale);
  
  // Iterate categories
  group.categories.forEach(category => {
    const categoryName = category.category; // Workspace language only, e.g., "Muster"
    const loopType = category.loopType; // Programmatic use, e.g., "pattern_switch"
    
    // Iterate tiers
    category.tiers.forEach(tier => {
      const tierTitle = getTierTitle(tier, userLocale);
      const tierDesc = getTierDescription(tier, userLocale);
    });
  });
});
```

### 3. Localization Helpers

```typescript
function getDescription(drillGroup: DrillGroup, locale: string): string {
  return drillGroup.description_i18n?.[locale] 
    ?? drillGroup.description_i18n?.en 
    ?? drillGroup.description;
}

function getTierTitle(tier: DrillTier, locale: string): string {
  return tier.title_i18n?.[locale] 
    ?? tier.title_i18n?.en 
    ?? tier.title;
}

function getTierDescription(tier: DrillTier, locale: string): string {
  return tier.description_i18n?.[locale] 
    ?? tier.description_i18n?.en 
    ?? tier.description;
}
```

### 4. Display

Show the description in your drill group UI (e.g., below the title, in a tooltip, or in a details panel).

## Example

```typescript
interface DrillGroup {
  id: string;
  kind: "drill_group";
  title: string; // Workspace language only (no i18n)
  description: string; // Workspace language (from i18n)
  description_i18n?: Record<string, string>; // Optional, localized
  categories: DrillCategory[];
}

interface DrillCategory {
  id: string; // loopType value
  category: string; // Workspace language only (no i18n)
  loopType: string; // Raw loopType for programmatic use
  tiers: DrillTier[];
}

interface DrillTier {
  id: string;
  tier: number;
  level: string;
  title: string; // Unique, descriptive (NOT repeating drill group title)
  title_i18n?: Record<string, string>; // Optional, localized
  description: string; // What user learns in this tier
  description_i18n?: Record<string, string>; // Optional, localized
  durationMinutes: number;
  status: string;
  entryUrl: string;
}

// Usage
drillGroups.forEach(group => {
  const groupDesc = getDescription(group, userLocale);
  
  renderDrillGroup({
    title: group.title, // Workspace language only
    description: groupDesc, // Use i18n
    categories: group.categories.map(cat => ({
      name: cat.category, // Workspace language only
      loopType: cat.loopType, // For programmatic use
      tiers: cat.tiers.map(tier => ({
        title: getTierTitle(tier, userLocale), // Use i18n
        description: getTierDescription(tier, userLocale), // Use i18n
        tier: tier.tier,
        level: tier.level,
        duration: tier.durationMinutes,
        entryUrl: tier.entryUrl
      }))
    }))
  });
});
```

## Workspace Language Rules

**Important**: These rules apply to all workspaces (documented for future workspaces):

- `DrillGroup.title`: Workspace language only (no i18n)
  - `"de"` workspace → German
  - Default to English if workspace language unknown
- `DrillCategory.category`: Workspace language only (no i18n)
  - `"de"` workspace → German labels (e.g., "Muster", "Paare", "Platzhalter")
- `DrillGroup.description`: Supports i18n (use `description_i18n[locale]` or fallback)
- `DrillTier.title`: Supports i18n (use `title_i18n[locale]` or fallback)
- `DrillTier.description`: Supports i18n (use `description_i18n[locale]` or fallback)

## Notes

- ✅ `title` and `category` are **workspace-language only** (no i18n needed)
- ✅ `description` and tier `title` support i18n (check `*_i18n` fields)
- ✅ Always fall back to workspace language if i18n is missing
- ✅ Tier titles are unique and descriptive (do NOT repeat drill group title)
- ❌ Do **not** read description from `DrillTier` objects directly (use the shaped API)
- ❌ Do **not** read from individual drill files (use the shaped API)
