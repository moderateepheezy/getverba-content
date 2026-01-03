# i18n Scaffolding

This document describes the i18n (internationalization) scaffolding system for GetVerba content.

## Overview

Content-delivered user-visible strings (titles, subtitles, labels) can be localized using optional i18n fields. For now, we ship only `en` (English) inside i18n objects, but the schema and validator support multi-language expansion.

## i18n Fields

### Entry Documents

Entry documents (packs, drills, exams) support:

- `title_i18n?: Record<string, string>` - Localized titles
- `subtitle_i18n?: Record<string, string>` - Localized subtitles
- `shortTitle_i18n?: Record<string, string>` - Localized short titles (drills)

### Index Items

Index items support:

- `title_i18n?: Record<string, string>` - Localized titles
- `subtitle_i18n?: Record<string, string>` - Localized subtitles
- `shortTitle_i18n?: Record<string, string>` - Localized short titles
- `topicLabel_i18n?: Record<string, string>` - Localized topic labels

### Scenario/Mechanics Summary Objects

- `title_i18n?: Record<string, string>`
- `subtitle_i18n?: Record<string, string>`

## Schema

i18n fields are objects mapping language codes to strings:

```typescript
{
  "title": "Doctor Appointment",
  "title_i18n": {
    "en": "Doctor Appointment",
    "de": "Arzttermin",
    "es": "Cita médica"
  }
}
```

## Validation Rules

1. **Structure**: i18n objects must be `Record<string, string>` (language code -> string)
2. **Non-empty values**: All values must be non-empty strings
3. **Max length**: `shortTitle_i18n[lang]` must be <= 28 characters
4. **Optional**: i18n fields are optional (backward compatible)
5. **"en" key**: If i18n exists, it SHOULD include `"en"` (soft rule: warns if missing; hard rule if `REQUIRE_I18N_EN=true`)

## Generator Behavior

Generators automatically populate i18n fields for NEW content:

- `title_i18n.en = title`
- `subtitle_i18n.en = subtitle`
- `shortTitle_i18n.en = shortTitle`

This is scaffolding only - no translations are generated.

## Frontend Usage

Frontend should use a helper function:

```typescript
function pickI18n(i18n: Record<string, string> | undefined, fallback: string, lang: string = 'en'): string {
  if (i18n && i18n[lang]) {
    return i18n[lang];
  }
  return fallback;
}

// Usage
const displayTitle = pickI18n(item.title_i18n, item.title);
```

## Localization vs Workspace

- **Workspace**: Determines the target language of the content (e.g., `de` workspace = German content)
- **i18n fields**: Allow UI strings to be displayed in different languages (e.g., German content with English UI labels)

These are independent concerns:
- A `de` workspace pack can have `title_i18n.en` for English UI
- A `de` workspace pack can have `title_i18n.de` for German UI
- The workspace language determines the content language (prompts, audio, etc.)

## Migration Strategy

1. **Phase 1 (current)**: All new content includes `*_i18n.en` fields
2. **Phase 2**: Manually add translations for other languages (e.g., `de`, `es`)
3. **Phase 3**: Frontend uses i18n fields when available, falls back to base fields

Content can gradually add more languages without breaking existing functionality.

## Examples

### Pack Entry

```json
{
  "id": "work_1",
  "title": "Office Meeting",
  "title_i18n": {
    "en": "Office Meeting"
  },
  "subtitle": "Schedule and confirm meetings",
  "subtitle_i18n": {
    "en": "Schedule and confirm meetings"
  }
}
```

### Drill Entry

```json
{
  "id": "verb_present_tense_a1_tier1",
  "title": "Verb Present Tense: A1 (Tier 1)",
  "title_i18n": {
    "en": "Verb Present Tense: A1 (Tier 1)"
  },
  "shortTitle": "Verb Present Tense A1",
  "shortTitle_i18n": {
    "en": "Verb Present Tense A1"
  },
  "subtitle": "Tier 1 - pattern switch",
  "subtitle_i18n": {
    "en": "Tier 1 - pattern switch"
  }
}
```

### Index Item

```json
{
  "id": "work_1",
  "title": "Office Meeting",
  "title_i18n": {
    "en": "Office Meeting"
  },
  "shortTitle": "Office Meeting",
  "shortTitle_i18n": {
    "en": "Office Meeting"
  }
}
```

