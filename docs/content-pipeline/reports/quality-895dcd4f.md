# Quality Report

**Generated:** 12/31/2025, 12:22:02 AM
**Git SHA:** 895dcd4f50d32a6c43457e20dda481e112fca938

## Summary

- **Total Packs:** 3
- 🟢 **Green:** 1
- 🟡 **Yellow:** 1
- 🔴 **Red:** 1

## Per-Scenario Coverage

| Scenario | Packs | Avg Richness |
|----------|-------|--------------|
| intro_lesson | 1 | 7.0 |
| work | 2 | 1.0 |

## Per-Pack Metrics

| Pack ID | Title | Scenario | Level | Status | Prompts | Avg Length | Tokens | Multi-Slot | Duplicates | Issues |
|---------|-------|----------|-------|--------|---------|------------|--------|------------|------------|--------|
| welcome_english | Welcome to English | intro_lesson | A1 | 🟢 GREEN | 2 | 56.5 | 7 | 100.0% | 0.0% | - |
| test-pack-complete-valid | Test Pack | work | A1 | 🟡 YELLOW | 2 | 19.0 | 2 | 50.0% | 0.0% | Scenario token coverage could be improved: 2 unique tokens |
| test-pack-valid-version | Test Pack | work | A1 | 🔴 RED | 0 | 0.0 | 0 | 0.0% | 0.0% | 1 step(s) have no scenario tokens; Variation slots declared but not used: subject, verb |

## 🔴 Red Status Packs (Action Required)

### test-pack-valid-version: Test Pack

- **Scenario:** work
- **Level:** A1
- **Prompts:** 0

**Issues:**
- 1 step(s) have no scenario tokens
- Variation slots declared but not used: subject, verb
