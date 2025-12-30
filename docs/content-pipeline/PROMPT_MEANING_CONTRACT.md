# Prompt Meaning Contract v1

This document defines the "Prompt Meaning Contract" - a schema and validation system that ensures every prompt has explicit meaning metadata and prevents non-native/literal translations (calques) at scale.

## Purpose

The Prompt Meaning Contract exists to:
- **Prevent calques**: Block literal word-for-word translations that sound unnatural
- **Ensure meaning clarity**: Require explicit intent and natural English glosses
- **Enforce pragmatics**: Ensure prompts use appropriate pragmatic markers for their intent/register/scenario
- **Support review**: Provide structured metadata for human reviewers to quickly assess prompt quality

## Schema

Every prompt in a pack must include:

### Required Fields

1. **`intent`** (string, enum, required)
   - Categorizes the communicative purpose of the prompt
   - Valid values: `"greet"`, `"request"`, `"apologize"`, `"inform"`, `"ask"`, `"confirm"`, `"schedule"`, `"order"`, `"ask_price"`, `"thank"`, `"goodbye"`
   - Example: `"request"`, `"apologize"`, `"greet"`

2. **`gloss_en`** (string, 6-180 chars, required)
   - Natural English meaning anchor
   - Must be genuine, idiomatic English (not a literal translation)
   - Hard-fails if it contains obvious German tokens (e.g., "bitte", "Termin", "Entschuldigung")
   - Example: `"Could you help me?"` (not `"Can you me help?"` or `"Können Sie mir helfen?"`)

### Optional Fields

3. **`register`** (string, enum, optional)
   - Formality level: `"formal"`, `"neutral"`, `"informal"`, `"casual"`
   - Defaults to pack-level `register` if missing
   - Must match pack-level register if pack register is set

4. **`alt_de`** (string, 6-240 chars, optional)
   - Native German paraphrase of the main prompt
   - Should differ meaningfully from `text` (similarity warning if too close)
   - Useful for showing alternative natural phrasing

## Validation Rules

### Hard Fails

1. **Missing intent**: Prompt without `intent` field fails validation
2. **Missing/invalid gloss_en**: 
   - Missing `gloss_en` fails
   - `gloss_en` < 6 chars or > 180 chars fails
   - `gloss_en` contains German tokens (literal translation) fails
3. **Invalid register**: 
   - If `register` is present, must be one of: `"formal"`, `"neutral"`, `"informal"`, `"casual"`
   - Pack-level `register` must also be valid
4. **Calque denylist**: 
   - If prompt `text` contains any phrase from `content/meta/denylists/de_calques.json`, validation fails
   - Case-insensitive substring match
5. **Pragmatics rules**: 
   - If prompt matches a rule in `content/meta/pragmatics/de_rules.json`, it must satisfy the rule
   - Rules specify `requireAnyTokens` (at least 1 must appear) and `forbidTokens` (none may appear)
   - Matching is based on `scenario`, `intent`, `register`, `primaryStructure`

### Warnings (Non-Fatal)

1. **alt_de similarity**: 
   - If `alt_de` exists and normalized similarity to `text` > 0.85, emit warning
   - Similarity computed via Levenshtein distance and Jaccard token overlap

## Examples

### ✅ Valid Prompt

```json
{
  "id": "prompt-001",
  "text": "Könnten Sie mir bitte helfen?",
  "intent": "request",
  "register": "formal",
  "gloss_en": "Could you help me, please?",
  "alt_de": "Würden Sie mir helfen können?"
}
```

**Why valid:**
- Has required `intent` and `gloss_en`
- `gloss_en` is natural English (not literal)
- Matches pragmatics rule for `request` + `formal` (contains "könnten")
- No calque phrases detected

### ❌ Invalid: Missing Intent

```json
{
  "id": "prompt-002",
  "text": "Guten Tag",
  "gloss_en": "Good day"
}
```

**Why invalid:** Missing required `intent` field.

### ❌ Invalid: Literal Translation in gloss_en

```json
{
  "id": "prompt-003",
  "text": "Entschuldigung",
  "intent": "apologize",
  "gloss_en": "Entschuldigung, I am sorry"
}
```

**Why invalid:** `gloss_en` contains German token "Entschuldigung" (literal translation).

### ❌ Invalid: Calque Phrase

```json
{
  "id": "prompt-004",
  "text": "Ich bin beschäftigt",
  "intent": "inform",
  "gloss_en": "I am busy"
}
```

**Why invalid:** Contains calque phrase "ich bin beschäftigt" (literal translation of "I am busy"). Should be "Ich habe viel zu tun" or "Ich bin im Stress".

### ❌ Invalid: Missing Pragmatic Marker

```json
{
  "id": "prompt-005",
  "text": "Helfen Sie mir",
  "intent": "request",
  "register": "formal",
  "gloss_en": "Help me"
}
```

**Why invalid:** Formal request must include polite modal markers (e.g., "könnten", "würden"). Missing required tokens from pragmatics rule.

### ⚠️ Warning: alt_de Too Similar

```json
{
  "id": "prompt-006",
  "text": "Ich gehe zur Arbeit",
  "intent": "inform",
  "gloss_en": "I'm going to work",
  "alt_de": "Ich gehe zur Arbeit"
}
```

**Why warning:** `alt_de` is identical to `text` (similarity = 1.0). Should provide meaningful alternative phrasing.

## Intent Categories

| Intent | Description | Example |
|--------|-------------|---------|
| `greet` | Greeting someone | "Guten Tag", "Hallo" |
| `request` | Making a request | "Könnten Sie mir helfen?" |
| `apologize` | Apologizing | "Entschuldigung", "Tut mir leid" |
| `inform` | Providing information | "Das Meeting beginnt um 14:30" |
| `ask` | Asking a question | "Wie spät ist es?" |
| `confirm` | Confirming something | "Ja, das stimmt" |
| `schedule` | Scheduling/arranging | "Können wir einen Termin vereinbaren?" |
| `order` | Ordering (food, items) | "Ich hätte gerne eine Pizza" |
| `ask_price` | Asking about price | "Wie viel kostet das?" |
| `thank` | Expressing thanks | "Vielen Dank" |
| `goodbye` | Saying goodbye | "Auf Wiedersehen" |

## Calque Denylist

The calque denylist (`content/meta/denylists/de_calques.json`) contains phrases that are literal translations from English and sound unnatural in German. Examples:

- ❌ "Ich bin beschäftigt" (I am busy) → ✅ "Ich habe viel zu tun"
- ❌ "Ich bin müde" (I am tired) → ✅ "Ich bin erschöpft" or "Mir ist müde"
- ❌ "Ich bin stolz auf" (I am proud of) → ✅ "Ich bin stolz auf" is actually correct, but "stolz von" is wrong

The denylist will grow over time as more calques are identified.

## Pragmatics Rules

Pragmatics rules (`content/meta/pragmatics/de_rules.json`) enforce that prompts use appropriate linguistic markers for their communicative function. Rules match based on:

- `scenario`: e.g., "work", "restaurant", "shopping"
- `intent`: e.g., "request", "apologize", "schedule"
- `register`: e.g., "formal", "neutral", "informal"
- `primaryStructure`: e.g., "modal_verbs_requests", "dative_case"

Each rule specifies:
- `requireAnyTokens`: At least one of these tokens must appear in the prompt
- `forbidTokens`: None of these tokens may appear in the prompt

Multi-word tokens are supported (e.g., "könnten Sie", "wäre es möglich").

## Integration

The Prompt Meaning Contract is enforced:
- **During validation**: `npm run content:validate` will fail if any prompt violates the contract
- **During review**: `npm run content:report` generates a report highlighting meaning contract issues
- **Before publish**: Publish scripts run validation, preventing invalid content from reaching production

## Related Documentation

- [Pack Schema](./PACK_SCHEMA.md) - Complete pack entry schema
- [Quality Gates](./QUALITY_GATES.md) - Content quality constraints
- [Schema Compatibility Policy](./SCHEMA_COMPATIBILITY.md) - Versioning and compatibility

