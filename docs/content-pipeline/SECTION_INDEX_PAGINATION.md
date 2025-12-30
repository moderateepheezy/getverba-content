# Section Index Pagination

This document defines the canonical pagination convention for section indexes.

**⚠️ Important: Indexes are automatically generated from entry documents. Do not edit index files manually.**

## File Naming Convention

| Page | File Path |
|------|-----------|
| Page 1 | `content/v1/workspaces/{ws}/{sectionId}/index.json` |
| Page 2 | `content/v1/workspaces/{ws}/{sectionId}/index.page2.json` |
| Page 3 | `content/v1/workspaces/{ws}/{sectionId}/index.page3.json` |
| Page N | `content/v1/workspaces/{ws}/{sectionId}/index.page{N}.json` |

## nextPage Semantics

- **Type**: `string | null`
- **Format**: Absolute path under `/v1/**` (must start with `/v1/`)
- **Example**: `"/v1/workspaces/de/mechanics/index.page2.json"`

When `nextPage` is `null`, the page is the last in the chain.

## Required Invariants

The following must be consistent across ALL pages in a pagination chain:

| Field | Requirement |
|-------|-------------|
| `version` | Must be identical across all pages |
| `kind` | Must be identical across all pages |
| `pageSize` | Must be identical across all pages |
| `total` | Must be identical across all pages (represents total items in entire chain) |

### Additional Invariants

1. **Unique IDs**: `items[].id` must be globally unique across all pages
2. **Total Accuracy**: `total` must equal the sum of `items.length` across all pages
3. **No Loops**: Chain must terminate (no circular references)
4. **Valid Path**: `nextPage` must start with `/v1/` and end with `.json`
5. **File Exists**: Every `nextPage` path must resolve to an existing file

## Schema Per Page

Each page file uses the standard SectionIndex schema:

```json
{
  "version": "v1",
  "kind": "drills",
  "total": 4,
  "pageSize": 2,
  "items": [
    {
      "id": "item-1",
      "kind": "drill",
      "title": "Item Title",
      "level": "A1",
      "durationMinutes": 10,
      "entryUrl": "/v1/workspaces/de/drills/item-1/drill.json"
    },
    {
      "id": "item-2",
      "kind": "drill",
      "title": "Item 2 Title",
      "level": "A1",
      "durationMinutes": 12,
      "entryUrl": "/v1/workspaces/de/drills/item-2/drill.json"
    }
  ],
  "nextPage": "/v1/workspaces/de/mechanics/index.page2.json"
}
```

## Example: 2-Page Mechanics Section

### Page 1: `mechanics/index.json`

```json
{
  "version": "v1",
  "kind": "drills",
  "total": 4,
  "pageSize": 2,
  "items": [
    {
      "id": "verb_endings_a1",
      "kind": "drill",
      "title": "Verb Endings - Present Tense",
      "level": "A1",
      "durationMinutes": 10,
      "entryUrl": "/v1/workspaces/de/drills/verb_endings_a1/drill.json"
    },
    {
      "id": "dative_case_a1",
      "kind": "drill",
      "title": "Dative Case Practice",
      "level": "A1",
      "durationMinutes": 12,
      "entryUrl": "/v1/workspaces/de/drills/dative_case_a1/drill.json"
    }
  ],
  "nextPage": "/v1/workspaces/de/mechanics/index.page2.json"
}
```

### Page 2: `mechanics/index.page2.json`

```json
{
  "version": "v1",
  "kind": "drills",
  "total": 4,
  "pageSize": 2,
  "items": [
    {
      "id": "akkusativ_prepositions_a1",
      "kind": "drill",
      "title": "Accusative Prepositions",
      "level": "A1",
      "durationMinutes": 10,
      "entryUrl": "/v1/workspaces/de/drills/akkusativ_prepositions_a1/drill.json"
    },
    {
      "id": "separable_verbs_a1",
      "kind": "drill",
      "title": "Separable Verbs",
      "level": "A1",
      "durationMinutes": 15,
      "entryUrl": "/v1/workspaces/de/drills/separable_verbs_a1/drill.json"
    }
  ],
  "nextPage": null
}
```

## Validation

The validator performs these checks:

### Hard Failures (Error)

| Check | Description |
|-------|-------------|
| Missing file | `nextPage` points to non-existent file |
| Loop detected | Same page visited twice in chain |
| Mismatched `kind` | `kind` differs between pages |
| Mismatched `version` | `version` differs between pages |
| Mismatched `pageSize` | `pageSize` differs between pages |
| Mismatched `total` | `total` differs between pages |
| Duplicate ID | Same `items[].id` appears in multiple pages |
| Total mismatch | Sum of items ≠ `total` value |
| Invalid path | `nextPage` doesn't start with `/v1/` |

### Soft Warnings (Warning, no failure)

| Check | Description |
|-------|-------------|
| Partial last page | Last page has fewer than `pageSize` items |
| Small pageSize | `total` is large but `pageSize` is tiny |

## Smoke Test

The smoke test follows `nextPage` chains when testing section indexes:

```bash
# Default behavior: follows nextPage
./scripts/smoke-test-content.sh --sample 5

# Flags
--follow-next-page    # Default: ON
--max-pages 20        # Safety guard (default: 20)
```

## Backwards Compatibility

Sections that fit in a single page continue to work unchanged:
- Set `nextPage: null` (or omit it)
- `total` equals `items.length`
- No additional files needed

## Frontend Usage

```typescript
async function loadAllItems(indexUrl: string): Promise<Item[]> {
  const allItems: Item[] = [];
  let currentUrl: string | null = indexUrl;
  
  while (currentUrl) {
    const response = await fetch(`${BASE_URL}${currentUrl}`);
    const page = await response.json();
    allItems.push(...page.items);
    currentUrl = page.nextPage;
  }
  
  return allItems;
}
```

## Related Documentation

- [Section Index Schema](../SECTION_INDEX_SCHEMA.md)
- [Entry URL Schema](./ENTRY_URL_SCHEMA.md)

