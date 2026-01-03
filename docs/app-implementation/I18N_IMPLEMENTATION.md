# Frontend i18n Implementation Guide

> **Status**: Ready for Implementation  
> **Backend Status**: ✅ Complete - All content has i18n fields populated  
> **Breaking Changes**: None - Fully backward compatible

This guide explains how to implement i18n support in the GetVerba frontend, consuming the new `title_i18n`, `shortTitle_i18n`, `description_i18n`, and grouping metadata fields.

## Overview

The backend now provides:
- **i18n fields**: `title_i18n`, `shortTitle_i18n`, `description_i18n` (all optional, backward compatible)
- **Grouping metadata**: `groupId`, `groupTitle`, `groupTitle_i18n` for scenario pack lists
- **100% coverage**: All 89 packs have grouping metadata, all content has English i18n fields

## Priority Order (Fallback Chain)

**Always prioritize i18n fields first**, then fall back gracefully:

```
1. title_i18n[userLocale]        ← Preferred: User's locale
2. title_i18n[languageCode]      ← Fallback: Language only (e.g., "de" from "de-AT")
3. title_i18n.en                 ← Fallback: English i18n
4. title                          ← Ultimate fallback: Base field
```

**Why this order?**
- i18n fields are the future - prioritize them when available
- English i18n (`title_i18n.en`) is guaranteed to exist after backfill
- Base fields (`title`) remain for backward compatibility during transition

## Implementation

### 1. Localized Title Helper

```typescript
/**
 * Get localized title with fallback chain
 * 
 * Priority:
 * 1. title_i18n[userLocale] (exact match)
 * 2. title_i18n[languageCode] (language-only match)
 * 3. title_i18n.en (English i18n)
 * 4. title (base field - backward compat)
 */
function getLocalizedTitle(
  item: {
    title: string;
    title_i18n?: Record<string, string>;
  },
  userLocale: string = 'en'
): string {
  // 1. Try exact locale match
  if (item.title_i18n?.[userLocale]) {
    return item.title_i18n[userLocale];
  }
  
  // 2. Try language-only match (e.g., "de" from "de-AT")
  const languageCode = userLocale.split('-')[0];
  if (languageCode !== userLocale && item.title_i18n?.[languageCode]) {
    return item.title_i18n[languageCode];
  }
  
  // 3. Fall back to English i18n
  if (item.title_i18n?.en) {
    return item.title_i18n.en;
  }
  
  // 4. Ultimate fallback to base field
  return item.title;
}
```

### 2. Localized Short Title Helper

```typescript
function getLocalizedShortTitle(
  item: {
    shortTitle?: string;
    shortTitle_i18n?: Record<string, string>;
  },
  userLocale: string = 'en'
): string | undefined {
  // Same fallback chain as title
  if (item.shortTitle_i18n?.[userLocale]) {
    return item.shortTitle_i18n[userLocale];
  }
  
  const languageCode = userLocale.split('-')[0];
  if (languageCode !== userLocale && item.shortTitle_i18n?.[languageCode]) {
    return item.shortTitle_i18n[languageCode];
  }
  
  if (item.shortTitle_i18n?.en) {
    return item.shortTitle_i18n.en;
  }
  
  return item.shortTitle;
}
```

### 3. Localized Description Helper

```typescript
function getLocalizedDescription(
  item: {
    description?: string;
    description_i18n?: Record<string, string>;
  },
  userLocale: string = 'en'
): string | undefined {
  // Same fallback chain
  if (item.description_i18n?.[userLocale]) {
    return item.description_i18n[userLocale];
  }
  
  const languageCode = userLocale.split('-')[0];
  if (languageCode !== userLocale && item.description_i18n?.[languageCode]) {
    return item.description_i18n[languageCode];
  }
  
  if (item.description_i18n?.en) {
    return item.description_i18n.en;
  }
  
  return item.description;
}
```

### 4. Localized Group Title Helper

```typescript
function getLocalizedGroupTitle(
  item: {
    groupTitle?: string;
    groupTitle_i18n?: Record<string, string>;
  },
  userLocale: string = 'en'
): string | undefined {
  // Same fallback chain
  if (item.groupTitle_i18n?.[userLocale]) {
    return item.groupTitle_i18n[userLocale];
  }
  
  const languageCode = userLocale.split('-')[0];
  if (languageCode !== userLocale && item.groupTitle_i18n?.[languageCode]) {
    return item.groupTitle_i18n[languageCode];
  }
  
  if (item.groupTitle_i18n?.en) {
    return item.groupTitle_i18n.en;
  }
  
  return item.groupTitle;
}
```

### 5. Localized Prompt Meaning Helper

```typescript
function getLocalizedGlossEn(
  prompt: {
    gloss_en: string;
    gloss_en_i18n?: Record<string, string>;
  },
  userLocale: string = 'en'
): string {
  // Same fallback chain as other i18n fields
  if (prompt.gloss_en_i18n?.[userLocale]) {
    return prompt.gloss_en_i18n[userLocale];
  }
  
  const languageCode = userLocale.split('-')[0];
  if (languageCode !== userLocale && prompt.gloss_en_i18n?.[languageCode]) {
    return prompt.gloss_en_i18n[languageCode];
  }
  
  if (prompt.gloss_en_i18n?.en) {
    return prompt.gloss_en_i18n.en;
  }
  
  // Ultimate fallback to base field
  return prompt.gloss_en;
}
```

## React Hook Example

```typescript
import { useMemo } from 'react';
import { useUserLocale } from './useUserLocale'; // Your locale hook

interface UseLocalizedContentOptions {
  title: string;
  title_i18n?: Record<string, string>;
  shortTitle?: string;
  shortTitle_i18n?: Record<string, string>;
  description?: string;
  description_i18n?: Record<string, string>;
  groupTitle?: string;
  groupTitle_i18n?: Record<string, string>;
  gloss_en?: string;
  gloss_en_i18n?: Record<string, string>;
}

export function useLocalizedContent(item: UseLocalizedContentOptions) {
  const userLocale = useUserLocale(); // e.g., 'en', 'de', 'de-AT'
  
  return useMemo(() => {
    const getLocalized = (
      base: string | undefined,
      i18n: Record<string, string> | undefined
    ): string | undefined => {
      if (i18n?.[userLocale]) return i18n[userLocale];
      const lang = userLocale.split('-')[0];
      if (lang !== userLocale && i18n?.[lang]) return i18n[lang];
      if (i18n?.en) return i18n.en;
      return base;
    };
    
    return {
      title: getLocalized(item.title, item.title_i18n) || item.title,
      shortTitle: getLocalized(item.shortTitle, item.shortTitle_i18n),
      description: getLocalized(item.description, item.description_i18n),
      groupTitle: getLocalized(item.groupTitle, item.groupTitle_i18n),
      glossEn: getLocalized(item.gloss_en, item.gloss_en_i18n) || item.gloss_en,
    };
  }, [item, userLocale]);
}
```

## Nested Structures

Some content has nested structures with user-facing text that also need i18n support:

### Exam Parts
```typescript
interface ExamPart {
  id: string;
  title: string;
  title_i18n?: Record<string, string>;
  description: string;
  description_i18n?: Record<string, string>;  // ← Also localized
  // ... other fields
}
```

### Practice Modules
```typescript
interface PracticeModule {
  id: string;
  title: string;
  title_i18n?: Record<string, string>;
  description: string;
  description_i18n?: Record<string, string>;  // ← Also localized
  // ... other fields
}
```

### Session Plan Steps
```typescript
interface SessionPlanStep {
  id: string;
  title: string;
  title_i18n?: Record<string, string>;
  promptIds: string[];
  // Note: Steps don't have descriptions
}
```

**All nested structures follow the same fallback chain as root-level fields.**

## Usage in Components

### Example: Pack Card Component

```typescript
import { useLocalizedContent } from './useLocalizedContent';

interface PackCardProps {
  pack: {
    id: string;
    title: string;
    title_i18n?: Record<string, string>;
    shortTitle?: string;
    shortTitle_i18n?: Record<string, string>;
    description?: string;
    description_i18n?: Record<string, string>;
    level: string;
    durationMinutes: number;
  };
}

export function PackCard({ pack }: PackCardProps) {
  const { title, shortTitle, description } = useLocalizedContent(pack);
  
  return (
    <div className="pack-card">
      <h3>{title}</h3>
      {shortTitle && <p className="short-title">{shortTitle}</p>}
      {description && <p className="description">{description}</p>}
      <div className="meta">
        <span>{pack.level}</span>
        <span>{pack.durationMinutes} min</span>
      </div>
    </div>
  );
}
```

## Grouping Implementation

### Grouping Algorithm

All scenario pack lists now support grouping. Every pack belongs to a group - **no orphans**.

```typescript
interface GroupedItem {
  groupId: string;
  groupTitle: string;
  items: PackItem[];
}

function groupItems<T extends { groupId?: string; groupTitle?: string; groupTitle_i18n?: Record<string, string> }>(
  items: T[],
  userLocale: string = 'en'
): GroupedItem[] {
  const groups: Map<string, GroupedItem> = new Map();
  const groupOrder: string[] = [];
  
  for (const item of items) {
    // Get groupId (required - no orphans)
    const groupId = item.groupId || '__ungrouped__';
    
    // Initialize group if first occurrence
    if (!groups.has(groupId)) {
      groupOrder.push(groupId);
      
      // Get localized group title
      const groupTitle = getLocalizedGroupTitle(item, userLocale) || groupId;
      
      groups.set(groupId, {
        groupId,
        groupTitle,
        items: []
      });
    }
    
    // Add item to group (maintains original order)
    groups.get(groupId)!.items.push(item as any);
  }
  
  // Return groups in order of first appearance
  return groupOrder.map(id => groups.get(id)!);
}
```

### Example: Prompt Component with Meaning

```typescript
import { useLocalizedContent } from './useLocalizedContent';

interface PromptComponentProps {
  prompt: {
    id: string;
    text: string;
    gloss_en: string;
    gloss_en_i18n?: Record<string, string>;
    intent: string;
  };
  userLocale: string;
}

export function PromptComponent({ prompt, userLocale }: PromptComponentProps) {
  const { glossEn } = useLocalizedContent({
    gloss_en: prompt.gloss_en,
    gloss_en_i18n: prompt.gloss_en_i18n
  });
  
  return (
    <div className="prompt">
      <p className="prompt-text">{prompt.text}</p>
      {/* Meaning block - ALWAYS show for all prompts with gloss_en */}
      {/* Note: gloss_en is required for all prompts, so this block should always appear */}
      {prompt.gloss_en && (
        <div className="meaning-block">
          <strong>Meaning:</strong> {glossEn}
        </div>
      )}
    </div>
  );
}
```

### Example: Exam Component with Nested Structures

```typescript
import { useLocalizedContent } from './useLocalizedContent';

interface ExamComponentProps {
  exam: {
    title: string;
    title_i18n?: Record<string, string>;
    description?: string;
    description_i18n?: Record<string, string>;
    sections: Array<{
      title: string;
      title_i18n?: Record<string, string>;
      parts: Array<{
        title: string;
        title_i18n?: Record<string, string>;
        description: string;
        description_i18n?: Record<string, string>;
      }>;
    }>;
    practiceModules: Array<{
      title: string;
      title_i18n?: Record<string, string>;
      description: string;
      description_i18n?: Record<string, string>;
    }>;
  };
}

export function ExamComponent({ exam }: ExamComponentProps) {
  const { title, description } = useLocalizedContent(exam);
  
  return (
    <div className="exam">
      <h1>{title}</h1>
      {description && <p>{description}</p>}
      
      {exam.sections.map((section) => {
        const sectionTitle = useLocalizedContent(section).title;
        return (
          <div key={section.id} className="section">
            <h2>{sectionTitle}</h2>
            {section.parts.map((part) => {
              const partTitle = useLocalizedContent(part).title;
              const partDescription = useLocalizedContent(part).description;
              return (
                <div key={part.id} className="part">
                  <h3>{partTitle}</h3>
                  {partDescription && <p>{partDescription}</p>}
                </div>
              );
            })}
          </div>
        );
      })}
      
      {exam.practiceModules.map((module) => {
        const moduleTitle = useLocalizedContent(module).title;
        const moduleDescription = useLocalizedContent(module).description;
        return (
          <div key={module.id} className="practice-module">
            <h3>{moduleTitle}</h3>
            {moduleDescription && <p>{moduleDescription}</p>}
          </div>
        );
      })}
    </div>
  );
}
```

### Example: Scenario Pack List with Grouping

```typescript
import { useMemo } from 'react';
import { useUserLocale } from './useUserLocale';

interface ScenarioPackListProps {
  items: Array<{
    id: string;
    title: string;
    title_i18n?: Record<string, string>;
    shortTitle?: string;
    shortTitle_i18n?: Record<string, string>;
    groupId?: string;
    groupTitle?: string;
    groupTitle_i18n?: Record<string, string>;
    // ... other fields
  }>;
}

export function ScenarioPackList({ items }: ScenarioPackListProps) {
  const userLocale = useUserLocale();
  const { title: getTitle, groupTitle: getGroupTitle } = useLocalizedContent({});
  
  const groupedItems = useMemo(() => {
    return groupItems(items, userLocale);
  }, [items, userLocale]);
  
  return (
    <div className="scenario-pack-list">
      {groupedItems.map((group) => (
        <div key={group.groupId} className="pack-group">
          <h2 className="group-header">{group.groupTitle}</h2>
          <div className="pack-grid">
            {group.items.map((item) => (
              <PackCard
                key={item.id}
                pack={{
                  ...item,
                  title: getTitle(item),
                  shortTitle: getShortTitle(item),
                }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
```

## Scenario Groups Reference

All scenarios have predefined groups. Here's the complete reference:

### Doctor (16 packs)
- `booking-appointments` - Booking Appointments
- `describing-symptoms` - Describing Symptoms
- `getting-prescriptions` - Getting Prescriptions

### Friends Small Talk (24 packs)
- `making-plans` - Making Plans
- `preferences-opinions` - Preferences & Opinions
- `responding-rescheduling` - Responding & Rescheduling

### Government Office (6 packs)
- `registration-documents` - Registration & Documents
- `permits-visas` - Permits & Visas
- `public-services` - Public Services

### Housing (20 packs)
- `searching-listings` - Searching & Listings
- `viewing-apartments` - Viewing Apartments
- `rental-agreements` - Rental Agreements

### Work (23 packs)
- `office-greetings` - Office Greetings
- `meetings-scheduling` - Meetings & Scheduling
- `tasks-requests` - Tasks & Requests

## TypeScript Types

```typescript
// Base types (existing)
interface PackItem {
  id: string;
  title: string;
  shortTitle?: string;
  description?: string;
  // ... other fields
}

// Extended with i18n (new)
interface PackItemWithI18n extends PackItem {
  title_i18n?: Record<string, string>;
  shortTitle_i18n?: Record<string, string>;
  description_i18n?: Record<string, string>;
  groupId?: string;
  groupTitle?: string;
  groupTitle_i18n?: Record<string, string>;
}

// Scenario index item
interface ScenarioIndexItem extends PackItemWithI18n {
  scenario: string;
  level: string;
  durationMinutes: number;
  // ... other fields
}
```

## Migration Path

### Phase 1: Add i18n Support (Current)

1. ✅ **Backend**: All content has `title_i18n.en` populated
2. ✅ **Backend**: All packs have grouping metadata
3. ⏳ **Frontend**: Implement `getLocalizedTitle()` helpers
4. ⏳ **Frontend**: Update components to use i18n fields with fallback

**Action Items:**
- [ ] Create `useLocalizedContent` hook
- [ ] Update `PackCard` component
- [ ] Update `ScenarioPackList` component with grouping
- [ ] Test with English locale (should work immediately)

### Phase 2: Multi-Language Support (Future)

1. ⏳ **Backend**: Add German translations (`title_i18n.de`)
2. ⏳ **Frontend**: Add language switcher
3. ⏳ **Frontend**: Test with German locale

**Action Items:**
- [ ] Add language switcher UI
- [ ] Persist user locale preference
- [ ] Test fallback chain with missing translations

## Testing

### Test Cases

```typescript
describe('getLocalizedTitle', () => {
  it('prioritizes exact locale match', () => {
    const item = {
      title: 'English Title',
      title_i18n: { en: 'English Title', de: 'Deutscher Titel' }
    };
    expect(getLocalizedTitle(item, 'de')).toBe('Deutscher Titel');
  });
  
  it('falls back to language code', () => {
    const item = {
      title: 'English Title',
      title_i18n: { en: 'English Title', de: 'Deutscher Titel' }
    };
    expect(getLocalizedTitle(item, 'de-AT')).toBe('Deutscher Titel');
  });
  
  it('falls back to English i18n', () => {
    const item = {
      title: 'English Title',
      title_i18n: { en: 'English Title' }
    };
    expect(getLocalizedTitle(item, 'fr')).toBe('English Title');
  });
  
  it('falls back to base field when no i18n', () => {
    const item = {
      title: 'English Title'
    };
    expect(getLocalizedTitle(item, 'de')).toBe('English Title');
  });
});
```

## API Response Examples

### Pack Entry (with i18n)

```json
{
  "id": "doctor_pack_1_a1",
  "title": "Doctor A1 — 1: Making an Appointment",
  "title_i18n": {
    "en": "Doctor A1 — 1: Making an Appointment"
  },
  "shortTitle": "Phone booking",
  "shortTitle_i18n": {
    "en": "Phone booking"
  },
  "description": "Practice doctor scenarios at A1 level.",
  "description_i18n": {
    "en": "Practice doctor scenarios at A1 level."
  }
}
```

### Exam Entry (with nested i18n)

```json
{
  "id": "goethe_a1",
  "title": "Goethe-Zertifikat A1: Start Deutsch 1",
  "title_i18n": {
    "en": "Goethe-Zertifikat A1: Start Deutsch 1"
  },
  "description": "Official Goethe-Institut A1 certification exam practice...",
  "description_i18n": {
    "en": "Official Goethe-Institut A1 certification exam practice..."
  },
  "sections": [
    {
      "id": "hoeren",
      "title": "Hören (Listening)",
      "title_i18n": {
        "en": "Hören (Listening)"
      },
      "parts": [
        {
          "id": "hoeren_1",
          "title": "Teil 1: Kurze Ansagen",
          "title_i18n": {
            "en": "Teil 1: Kurze Ansagen"
          },
          "description": "Listen to short announcements and match them to pictures",
          "description_i18n": {
            "en": "Listen to short announcements and match them to pictures"
          }
        }
      ]
    }
  ],
  "practiceModules": [
    {
      "id": "intro_vocab",
      "title": "Introduction Vocabulary",
      "title_i18n": {
        "en": "Introduction Vocabulary"
      },
      "description": "Master key vocabulary for self-introduction",
      "description_i18n": {
        "en": "Master key vocabulary for self-introduction"
      }
    }
  ]
}
```

### Scenario Index Item (with grouping)

```json
{
  "id": "doctor_pack_1_a1",
  "title": "Doctor A1 — 1: Making an Appointment",
  "title_i18n": {
    "en": "Doctor A1 — 1: Making an Appointment"
  },
  "shortTitle": "Phone booking",
  "shortTitle_i18n": {
    "en": "Phone booking"
  },
  "groupId": "booking-appointments",
  "groupTitle": "Booking Appointments",
  "groupTitle_i18n": {
    "en": "Booking Appointments"
  }
}
```

## Best Practices

1. **Always use the helper functions** - Don't access `title_i18n` directly
2. **Respect the fallback chain** - Never skip steps
3. **Group items by `groupId`** - Maintain original order within groups
4. **Handle missing groups gracefully** - Use `__ungrouped__` as fallback
5. **Cache locale** - Don't recalculate on every render
6. **Type safety** - Use TypeScript types for all i18n fields

## Troubleshooting

### Issue: Titles not showing in user's language

**Check:**
1. Is `title_i18n[userLocale]` populated in API response?
2. Is fallback chain implemented correctly?
3. Is `userLocale` being passed correctly?

**Solution:**
- Verify API response includes `title_i18n` field
- Check console for locale value
- Test with `userLocale = 'en'` (guaranteed to exist)

### Issue: Groups not appearing

**Check:**
1. Is `groupId` present in API response?
2. Is grouping algorithm implemented?
3. Are items being filtered out?

**Solution:**
- Verify all items have `groupId` (100% coverage)
- Check `groupItems()` function
- Ensure no items are filtered before grouping

## Prompt Meaning Display

**Important**: The Meaning block should **always** be displayed for all prompts that have a `gloss_en` field. Since `gloss_en` is required for all prompts, the Meaning block should appear for every prompt.

### Implementation Pattern

```typescript
// ✅ Correct: Always show meaning if gloss_en exists
{prompt.gloss_en && (
  <div className="meaning-block">
    <strong>Meaning:</strong> {getLocalizedGlossEn(prompt, userLocale)}
  </div>
)}

// ❌ Incorrect: Don't check for translation/helperText
{prompt.translation && ( // Wrong - deprecated field
  <div className="meaning-block">...</div>
)}
```

The frontend should use `gloss_en` (or `gloss_en_i18n` with fallback) to display the meaning, not the deprecated `translation` or `helperText` fields.

## Related Documentation

- [Backend i18n Contract](../../content-pipeline/I18N_CONTRACT.md) - Complete backend schema
- [Section Index Schema](../../content-pipeline/SECTION_INDEX_PAGINATION.md) - Index structure
- [Scenario Index Schema](../../content-pipeline/SCENARIO_INDEX_SCHEMA.md) - Scenario structure
- [Prompt Meaning Contract](../../content-pipeline/PROMPT_MEANING_CONTRACT.md) - Meaning field requirements

## Support

For questions or issues:
1. Check backend API response includes `*_i18n` fields
2. Verify all packs have `groupId` (no orphans)
3. Test with English locale first (guaranteed to work)
4. Review fallback chain implementation

---

**Last Updated**: January 2026  
**Backend Version**: v1 (i18n fields populated)  
**Frontend Status**: Ready for implementation

