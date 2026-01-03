# Content Scenarios

This document describes the available content scenarios and their intended use cases.

## friends_small_talk

**Scenario ID**: `friends_small_talk`  
**Display Title**: "Friends: Small Talk"  
**Default Register**: `casual`  
**Primary Structure**: `modal_verbs_suggestions`

### Purpose

The `friends_small_talk` scenario focuses on casual conversations between friends, emphasizing:
- Making plans and arrangements
- Suggesting activities and preferences
- Checking in and rescheduling
- Expressing opinions and recommendations

This scenario is distinct from generic "Social" content in that it avoids boilerplate greetings and focuses on meaningful, contextual conversations that friends actually have.

### Intended Use

Use `friends_small_talk` for packs that train:
- Casual planning phrases ("Hast du Lust...", "Lass uns...", "Wie wäre es...")
- Time expressions in casual context (heute, morgen, am Wochenende)
- Activity vocabulary (Kino, Café, Restaurant, Spaziergang, Gym, etc.)
- Modal verbs in suggestions (können, wollen, sollen)
- Softeners and casual connectors (vielleicht, eigentlich, mal, aber, weil)

### Subtopic Areas

The scenario supports the following subtopics (used for grid subtitle strings):
- `plans` - Making plans and arrangements
- `weekend` - Weekend-specific activities
- `opinions` - Expressing opinions
- `recommendations` - Making recommendations
- `check-in` - Checking in with friends
- `food & cafés` - Food and café meetups
- `movies & series` - Entertainment discussions
- `sports & gym` - Fitness and sports activities

### Primary Structures

The scenario template supports these primary structures:
- Invitations + accepting/declining
- Modal verbs (können / wollen / sollen)
- Suggestions (lass uns…, wie wäre es…)
- Time expressions (heute, morgen, am Wochenende)
- Preferences (ich mag…, ich habe Lust auf…)
- Connectors (aber, weil, obwohl)
- Polite-ish casual softeners (vielleicht, eigentlich, mal)

### Token Dictionary

The scenario uses the following tokens (required for quality gates):
- Single tokens: wochenende, heute, morgen, spaeter, abends, zeit, lust, plan, idee, treffen, mitkommen, kino, cafe, restaurant, spaziergang, park, training, gym, serie, film, konzert, bar, pizza, kaffee
- Strong phrases: "hast du lust", "lass uns", "wie waere es", "hast du zeit", "wollen wir", "ich haette lust", "kommst du mit", "ich kann heute nicht"

### Example Packs

Generated packs include:
1. `friends_plans_weekend_a1` - Making weekend plans (A1)
2. `friends_cafe_meetup_a1` - Café meetup arrangements (A1)
3. `friends_movies_series_a1` - Discussing movies and series (A1)
4. `friends_suggestions_activity_a2` - Activity suggestions (A2)
5. `friends_opinions_recommendations_a2` - Opinions and recommendations (A2)
6. `friends_reschedule_and_decline_a2` - Rescheduling and declining (A2)

### Quality Gate Requirements

All `friends_small_talk` packs must:
- Include at least 2 scenario tokens per prompt
- Avoid banned generic greetings ("Hallo", "Wie geht's", "Mein Name ist", etc.)
- Maintain ≥30% multi-slot variation (2+ slots changed per prompt)
- Use casual register consistently (no formal "Sie")
- Include concreteness markers (times, weekdays, activities)

### Style Guidelines

- Keep sentences short and spoken
- Use "Berlin casual" tone without slang that breaks A1/A2 learners
- Prefer meaningful content: making plans, negotiating time/place, suggesting alternatives
- Include simple opinions ("Ich fand den Film gut, aber...")
- Avoid generic filler phrases

### Generation

Packs are generated using the template at:
```
content/templates/v1/scenarios/friends_small_talk.json
```

Use the generator script:
```bash
./scripts/generate-friends-small-talk-packs.sh [--workspace de]
```

Or generate individual packs:
```bash
npx tsx scripts/generate-pack.ts \
  --workspace de \
  --packId friends_plans_weekend_a1 \
  --scenario friends_small_talk \
  --level A1 \
  --seed 1001 \
  --title "Plans for the Weekend"
```


