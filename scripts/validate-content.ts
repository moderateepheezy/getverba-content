#!/usr/bin/env tsx

import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, dirname, relative } from 'path';
import { fileURLToPath } from 'url';
import { computePackAnalytics, computeDrillAnalytics } from './content-quality/computeAnalytics';
import { validateI18nAndGrouping } from './content-quality/i18nValidation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONTENT_DIR = process.env.CONTENT_DIR || join(__dirname, '..', 'content', 'v1');
const META_DIR = process.env.META_DIR || join(__dirname, '..', 'content', 'meta');

interface ValidationError {
  file: string;
  message: string;
}

const errors: ValidationError[] = [];

function addError(file: string, message: string) {
  errors.push({ file, message });
}

function isValidJsonPath(path: string): boolean {
  return typeof path === 'string' && path.endsWith('.json') && path.startsWith('/v1/');
}

function resolveContentPath(jsonPath: string): string {
  // Remove /v1/ prefix and resolve relative to content/v1
  const relativePath = jsonPath.replace(/^\/v1\//, '');
  return join(CONTENT_DIR, relativePath);
}

function validateEntryUrlPattern(entryUrl: string, itemId: string, kind: string, filePath: string, itemIdx: number): void {
  // Normalize kind to canonical form
  const normalizedKind = kind.toLowerCase();

  // Determine expected pattern based on kind
  let expectedPattern: RegExp;
  let expectedSuffix: string;

  if (normalizedKind === 'context' || normalizedKind === 'pack') {
    // Pack pattern: /v1/workspaces/{workspace}/packs/{packId}/pack.json
    expectedPattern = /^\/v1\/workspaces\/[^/]+\/packs\/[^/]+\/pack\.json$/;
    expectedSuffix = '/pack.json';
  } else if (normalizedKind === 'exams' || normalizedKind === 'exam') {
    // Exam pattern: /v1/workspaces/{workspace}/exams/{examId}/exam.json
    expectedPattern = /^\/v1\/workspaces\/[^/]+\/exams\/[^/]+\/exam\.json$/;
    expectedSuffix = '/exam.json';
  } else if (normalizedKind === 'drills' || normalizedKind === 'drill') {
    // Drill pattern: /v1/workspaces/{workspace}/drills/{drillId}/drill.json
    expectedPattern = /^\/v1\/workspaces\/[^/]+\/drills\/[^/]+\/drill\.json$/;
    expectedSuffix = '/drill.json';
  } else if (normalizedKind === 'tracks' || normalizedKind === 'track') {
    // Track pattern: /v1/workspaces/{workspace}/tracks/{trackId}/track.json
    expectedPattern = /^\/v1\/workspaces\/[^/]+\/tracks\/[^/]+\/track\.json$/;
    expectedSuffix = '/track.json';
  } else {
    // Unknown kind - skip pattern validation but warn
    return;
  }

  // Check if entryUrl matches expected pattern
  if (!expectedPattern.test(entryUrl)) {
    addError(filePath, `Item ${itemIdx} entryUrl does not match canonical pattern for kind "${kind}". Expected pattern: /v1/workspaces/{workspace}/${normalizedKind === 'context' || normalizedKind === 'pack' ? 'packs' : normalizedKind === 'exams' || normalizedKind === 'exam' ? 'exams' : 'drills'}/{id}/${normalizedKind === 'context' || normalizedKind === 'pack' ? 'pack' : normalizedKind === 'exams' || normalizedKind === 'exam' ? 'exam' : 'drill'}.json`);
    return;
  }

  // Extract packId/examId/drillId from URL and verify it matches item.id
  // URL format: /v1/workspaces/{workspace}/{type}/{id}/{file}.json
  const urlParts = entryUrl.split('/');
  const typeIndex = urlParts.indexOf(normalizedKind === 'context' || normalizedKind === 'pack' ? 'packs' : normalizedKind === 'exams' || normalizedKind === 'exam' ? 'exams' : 'drills');
  if (typeIndex >= 0 && typeIndex < urlParts.length - 2) {
    const urlId = urlParts[typeIndex + 1];
    // Normalize IDs for comparison (case-insensitive, handle kebab-case)
    const normalizedUrlId = urlId.toLowerCase().replace(/-/g, '_');
    const normalizedItemId = itemId.toLowerCase().replace(/-/g, '_');

    if (normalizedUrlId !== normalizedItemId) {
      addError(filePath, `Item ${itemIdx} entryUrl contains ID "${urlId}" but item.id is "${itemId}". They should match (case-insensitive).`);
    }
  }
}

function validateEntryDocument(entryPath: string, kind: string, contextFile: string, itemIdx: number): void {
  try {
    const content = readFileSync(entryPath, 'utf-8');
    const entry = JSON.parse(content);

    const normalizedKind = kind.toLowerCase();

    // Determine docType for schemaVersion validation
    let docType: string;
    if (normalizedKind === 'pack') {
      docType = 'PackEntry';
    } else if (normalizedKind === 'exam') {
      docType = 'ExamEntry';
    } else if (normalizedKind === 'drill') {
      docType = 'DrillEntry';
    } else if (normalizedKind === 'track') {
      docType = 'TrackEntry';
    } else {
      docType = 'Entry';
    }

    // Validate schemaVersion first
    validateSchemaVersion(docType, entry, entryPath);

    // Common required fields for all entry types
    if (!entry.id || typeof entry.id !== 'string') {
      addError(contextFile, `Item ${itemIdx} entry document missing or invalid field: id (must be string)`);
    }
    if (!entry.kind || typeof entry.kind !== 'string') {
      addError(contextFile, `Item ${itemIdx} entry document missing or invalid field: kind (must be string)`);
    } else if (entry.kind.toLowerCase() !== normalizedKind) {
      addError(contextFile, `Item ${itemIdx} entry document kind "${entry.kind}" does not match item kind "${kind}"`);
    }
    if (!entry.title || typeof entry.title !== 'string') {
      addError(contextFile, `Item ${itemIdx} entry document missing or invalid field: title (must be string)`);
    } else if (entry.title.length > MAX_TITLE_LENGTH) {
      addError(contextFile, `Item ${itemIdx} entry document title is too long (${entry.title.length} chars). Max is ${MAX_TITLE_LENGTH} chars.`);
    }

    // Validate i18n fields (optional, but must be valid if present)
    const i18nResult = validateI18nAndGrouping(entry);
    if (!i18nResult.valid) {
      for (const err of i18nResult.errors) {
        addError(contextFile, `Item ${itemIdx} entry document i18n validation: ${err}`);
      }
    }

    if (typeof entry.estimatedMinutes !== 'number') {
      addError(contextFile, `Item ${itemIdx} entry document missing or invalid field: estimatedMinutes (must be number)`);
    } else if (entry.estimatedMinutes < MIN_DURATION_MINUTES || entry.estimatedMinutes > MAX_DURATION_MINUTES) {
      addError(contextFile, `Item ${itemIdx} entry document estimatedMinutes (${entry.estimatedMinutes}) is outside valid range [${MIN_DURATION_MINUTES}-${MAX_DURATION_MINUTES}]`);
    }

    // Validate level is CEFR if present
    if (entry.level && typeof entry.level === 'string') {
      if (!VALID_CEFR_LEVELS.includes(entry.level.toUpperCase())) {
        addError(contextFile, `Item ${itemIdx} entry document level "${entry.level}" is not a valid CEFR level. Must be one of: ${VALID_CEFR_LEVELS.join(', ')}`);
      }
    }

    // Telemetry identifiers validation (required for all entry types except tracks)
    if (normalizedKind !== 'track') {
      if (!entry.contentId || typeof entry.contentId !== 'string') {
        addError(contextFile, `Item ${itemIdx} entry document missing or invalid field: contentId (must be string)`);
      } else {
        // Validate contentId pattern: {workspace}:{kind}:{id}
        const contentIdPattern = /^[a-z0-9_-]+:(pack|drill|exam):[a-z0-9_-]+$/;
        if (!contentIdPattern.test(entry.contentId)) {
          addError(contextFile, `Item ${itemIdx} entry document contentId "${entry.contentId}" does not match required pattern: {workspace}:{kind}:{id}`);
        }
      }

      if (!entry.contentHash || typeof entry.contentHash !== 'string') {
        addError(contextFile, `Item ${itemIdx} entry document missing or invalid field: contentHash (must be string)`);
      } else {
        // Validate contentHash is valid SHA256 hex (64 chars)
        if (!/^[a-f0-9]{64}$/.test(entry.contentHash)) {
          addError(contextFile, `Item ${itemIdx} entry document contentHash "${entry.contentHash}" is not a valid SHA256 hash (must be 64 hex characters)`);
        }
      }

      if (!entry.revisionId || typeof entry.revisionId !== 'string') {
        addError(contextFile, `Item ${itemIdx} entry document missing or invalid field: revisionId (must be string)`);
      } else {
        // Validate revisionId is derived from contentHash (first 12 chars)
        if (entry.contentHash && entry.revisionId !== entry.contentHash.substring(0, 12)) {
          addError(contextFile, `Item ${itemIdx} entry document revisionId "${entry.revisionId}" is not derived from contentHash (must be first 12 characters of contentHash)`);
        }
        // Validate revisionId format (12 hex chars)
        if (!/^[a-f0-9]{12}$/.test(entry.revisionId)) {
          addError(contextFile, `Item ${itemIdx} entry document revisionId "${entry.revisionId}" is not valid (must be 12 hex characters)`);
        }
      }
    }

    // Pack-specific validation
    if (normalizedKind === 'pack') {
      if (!entry.description || typeof entry.description !== 'string') {
        addError(contextFile, `Item ${itemIdx} pack entry missing or invalid field: description (must be string)`);
      }
      if (!Array.isArray(entry.outline) || entry.outline.length === 0) {
        addError(contextFile, `Item ${itemIdx} pack entry missing or invalid field: outline (must be non-empty array)`);
      }

      // Quality Gates v1: Required fields
      if (!entry.scenario || typeof entry.scenario !== 'string') {
        addError(contextFile, `Item ${itemIdx} pack entry missing or invalid field: scenario (must be string, 3-40 chars)`);
      } else if (entry.scenario.length < 3 || entry.scenario.length > 40) {
        addError(contextFile, `Item ${itemIdx} pack entry scenario length is invalid (${entry.scenario.length} chars). Must be 3-40 chars.`);
      }

      if (!entry.register || typeof entry.register !== 'string') {
        addError(contextFile, `Item ${itemIdx} pack entry missing or invalid field: register (must be "formal", "neutral", or "informal")`);
      } else if (!['formal', 'neutral', 'casual'].includes(entry.register)) {
        addError(contextFile, `Item ${itemIdx} pack entry register must be one of: "formal", "neutral", "casual"`);
      }

      if (!entry.primaryStructure || typeof entry.primaryStructure !== 'string') {
        addError(contextFile, `Item ${itemIdx} pack entry missing or invalid field: primaryStructure (must be string, 3-60 chars)`);
      } else if (entry.primaryStructure.length < 3 || entry.primaryStructure.length > 60) {
        addError(contextFile, `Item ${itemIdx} pack entry primaryStructure length is invalid (${entry.primaryStructure.length} chars). Must be 3-60 chars.`);
      }

      // Pack version validation (required for telemetry)
      if (!entry.packVersion || typeof entry.packVersion !== 'string') {
        addError(contextFile, `Item ${itemIdx} pack entry missing or invalid field: packVersion (must be string, semver format x.y.z)`);
      } else {
        // Validate semver format (x.y.z)
        const semverPattern = /^\d+\.\d+\.\d+$/;
        if (!semverPattern.test(entry.packVersion)) {
          addError(contextFile, `Item ${itemIdx} pack entry packVersion "${entry.packVersion}" is not valid semver format. Must be x.y.z (e.g., "1.0.0")`);
        }
      }

      // Analytics metadata validation (required for all packs)
      if (!entry.analytics || typeof entry.analytics !== 'object') {
        addError(contextFile, `Item ${itemIdx} pack entry missing or invalid field: analytics (must be object)`);
      } else {
        validateAnalytics(entry.analytics, entry, contextFile, itemIdx);
      }

      // Validate provenance (required for generated content)
      if (entry.provenance) {
        if (typeof entry.provenance !== 'object') {
          addError(contextFile, `Item ${itemIdx} pack entry provenance must be an object`);
        } else {
          if (!entry.provenance.source || typeof entry.provenance.source !== 'string') {
            addError(contextFile, `Item ${itemIdx} pack entry provenance.source is required and must be string`);
          } else if (!['pdf', 'template', 'handcrafted'].includes(entry.provenance.source)) {
            addError(contextFile, `Item ${itemIdx} pack entry provenance.source must be one of: "pdf", "template", "handcrafted"`);
          }

          if (entry.provenance.source !== 'handcrafted') {
            // Generated content must have all provenance fields
            if (!entry.provenance.sourceRef || typeof entry.provenance.sourceRef !== 'string') {
              addError(contextFile, `Item ${itemIdx} pack entry provenance.sourceRef is required for generated content`);
            }
            if (!entry.provenance.extractorVersion || typeof entry.provenance.extractorVersion !== 'string') {
              addError(contextFile, `Item ${itemIdx} pack entry provenance.extractorVersion is required for generated content`);
            }
            if (!entry.provenance.generatedAt || typeof entry.provenance.generatedAt !== 'string') {
              addError(contextFile, `Item ${itemIdx} pack entry provenance.generatedAt is required for generated content`);
            } else {
              // Validate ISO 8601 format
              const isoDate = new Date(entry.provenance.generatedAt);
              if (isNaN(isoDate.getTime())) {
                addError(contextFile, `Item ${itemIdx} pack entry provenance.generatedAt must be valid ISO 8601 format`);
              }
            }
          }
        }
      }

      // Validate review (required for generated content)
      if (entry.provenance && entry.provenance.source !== 'handcrafted') {
        if (!entry.review || typeof entry.review !== 'object') {
          addError(contextFile, `Item ${itemIdx} pack entry review is required for generated content`);
        } else {
          if (!entry.review.status || typeof entry.review.status !== 'string') {
            addError(contextFile, `Item ${itemIdx} pack entry review.status is required`);
          } else if (!['draft', 'needs_review', 'approved'].includes(entry.review.status)) {
            addError(contextFile, `Item ${itemIdx} pack entry review.status must be one of: "draft", "needs_review", "approved"`);
          }

          // If approved, must have reviewer and reviewedAt
          if (entry.review.status === 'approved') {
            if (!entry.review.reviewer || typeof entry.review.reviewer !== 'string') {
              addError(contextFile, `Item ${itemIdx} pack entry review.reviewer is required when status is "approved"`);
            }
            if (!entry.review.reviewedAt || typeof entry.review.reviewedAt !== 'string') {
              addError(contextFile, `Item ${itemIdx} pack entry review.reviewedAt is required when status is "approved"`);
            } else {
              const reviewedDate = new Date(entry.review.reviewedAt);
              if (isNaN(reviewedDate.getTime())) {
                addError(contextFile, `Item ${itemIdx} pack entry review.reviewedAt must be valid ISO 8601 format`);
              }
            }
          }
        }
      }

      // Validate sessionPlan (required for packs)
      if (!entry.sessionPlan || typeof entry.sessionPlan !== 'object') {
        addError(contextFile, `Item ${itemIdx} pack entry missing or invalid field: sessionPlan (must be object)`);
      } else {
        // Validate sessionPlan.version
        if (entry.sessionPlan.version !== 1) {
          addError(contextFile, `Item ${itemIdx} pack entry sessionPlan.version must be 1`);
        }

        // Validate sessionPlan.steps
        if (!Array.isArray(entry.sessionPlan.steps) || entry.sessionPlan.steps.length === 0) {
          addError(contextFile, `Item ${itemIdx} pack entry sessionPlan.steps must be a non-empty array`);
        } else {
          entry.sessionPlan.steps.forEach((step: any, sIdx: number) => {
            if (!step.id || typeof step.id !== 'string') {
              addError(contextFile, `Item ${itemIdx} pack entry sessionPlan.steps[${sIdx}] missing or invalid field: id (must be string)`);
            }
            if (!step.title || typeof step.title !== 'string') {
              addError(contextFile, `Item ${itemIdx} pack entry sessionPlan.steps[${sIdx}] missing or invalid field: title (must be string)`);
            }
            if (!Array.isArray(step.promptIds) || step.promptIds.length === 0) {
              addError(contextFile, `Item ${itemIdx} pack entry sessionPlan.steps[${sIdx}] missing or invalid field: promptIds (must be non-empty array)`);
            } else {
              // Validate each promptId is a string
              step.promptIds.forEach((promptId: any, pIdIdx: number) => {
                if (typeof promptId !== 'string') {
                  addError(contextFile, `Item ${itemIdx} pack entry sessionPlan.steps[${sIdx}].promptIds[${pIdIdx}] must be a string`);
                }
              });
            }
          });

          // Validate that all referenced promptIds exist in prompts array
          if (entry.prompts && Array.isArray(entry.prompts)) {
            const promptIds = new Set(entry.prompts.map((p: any) => p.id).filter(Boolean));
            entry.sessionPlan.steps.forEach((step: any, sIdx: number) => {
              if (Array.isArray(step.promptIds)) {
                step.promptIds.forEach((promptId: string) => {
                  if (!promptIds.has(promptId)) {
                    addError(contextFile, `Item ${itemIdx} pack entry sessionPlan.steps[${sIdx}] references promptId "${promptId}" which does not exist in prompts array`);
                  }
                });
              }
            });
          } else if (entry.promptsUrl) {
            // If promptsUrl is used, we can't validate promptIds exist (they're in external file)
            // This is acceptable - frontend will need to load promptsUrl and validate
          } else {
            // No prompts and no promptsUrl - can't validate promptIds
            addError(contextFile, `Item ${itemIdx} pack entry has sessionPlan but no prompts array or promptsUrl. Prompts are required when sessionPlan references promptIds.`);
          }

          // Warn if outline.length doesn't match steps.length (non-fatal)
          if (Array.isArray(entry.outline) && entry.outline.length !== entry.sessionPlan.steps.length) {
            // This is a warning, not an error - we'll just log it
            console.warn(`⚠️  Item ${itemIdx} pack entry outline.length (${entry.outline.length}) does not match sessionPlan.steps.length (${entry.sessionPlan.steps.length}). This is allowed but may indicate a mismatch.`);
          }
        }
      }


      // Validate microNotes (optional, reserved for future use)
      if (entry.microNotes !== undefined) {
        if (!Array.isArray(entry.microNotes)) {
          addError(contextFile, `Item ${itemIdx} pack entry microNotes must be an array if present`);
        } else {
          entry.microNotes.forEach((note: any, nIdx: number) => {
            if (!note.id || typeof note.id !== 'string') {
              addError(contextFile, `Item ${itemIdx} pack entry microNotes[${nIdx}] missing or invalid field: id (must be string)`);
            }
            if (!note.text || typeof note.text !== 'string') {
              addError(contextFile, `Item ${itemIdx} pack entry microNotes[${nIdx}] missing or invalid field: text (must be string)`);
            } else if (note.text.length > MAX_MICRO_NOTE_LENGTH) {
              addError(contextFile, `Item ${itemIdx} pack entry microNotes[${nIdx}].text is too long (${note.text.length} chars). Max is ${MAX_MICRO_NOTE_LENGTH} chars.`);
            }
          });

          // Ensure microNotes are not referenced in sessionPlan (they're disabled by design)
          if (entry.sessionPlan && Array.isArray(entry.sessionPlan.steps)) {
            // This is just a check - microNotes are not referenced, so this is informational
            // We don't fail validation, but we could warn if needed
          }
        }
      }

      // Prompts are optional but if present, validate structure
      if (entry.prompts !== undefined) {
        if (!Array.isArray(entry.prompts)) {
          addError(contextFile, `Item ${itemIdx} pack entry prompts must be an array if present`);
        } else {
          entry.prompts.forEach((prompt: any, pIdx: number) => {
            if (!prompt.id || typeof prompt.id !== 'string') {
              addError(contextFile, `Item ${itemIdx} pack entry prompt ${pIdx} missing or invalid field: id`);
            }
            if (!prompt.text || typeof prompt.text !== 'string') {
              addError(contextFile, `Item ${itemIdx} pack entry prompt ${pIdx} missing or invalid field: text`);
            } else {
              // Prompt quality guardrails
              if (prompt.text.length < MIN_PROMPT_TEXT_LENGTH) {
                addError(contextFile, `Item ${itemIdx} pack entry prompt ${pIdx} text is too short (${prompt.text.length} chars). Min is ${MIN_PROMPT_TEXT_LENGTH} chars.`);
              }
              if (prompt.text.length > MAX_PROMPT_TEXT_LENGTH) {
                addError(contextFile, `Item ${itemIdx} pack entry prompt ${pIdx} text is too long (${prompt.text.length} chars). Max is ${MAX_PROMPT_TEXT_LENGTH} chars.`);
              }

              // Check for verb-like token (warning only for now)
              // Simple heuristic: look for common verb patterns or verb endings
              const verbPatterns = /\b(gehen|kommen|sein|haben|werden|machen|sagen|geben|sehen|wissen|können|müssen|sollen|dürfen|wollen|mögen|sein|haben|ist|sind|war|waren|hat|haben|wird|werden|macht|machen|sagt|sagen|geht|gehen|kommt|kommen|gibt|geben|sieht|sehen|weiß|wissen|kann|können|muss|müssen|soll|sollen|darf|dürfen|will|wollen|mag|mögen|wohnen|wohnt|suchen|sucht|finden|findet|zeigen|zeigt|mieten|mietet|brauchen|braucht|nehmen|nimmt|vereinbaren|vereinbart|fühlen|fühlt|beginnen|beginnt|planen|trinken|treffen|essen|schauen|helfen|organisieren|besprechen|verstehen|kaufen|zahlen|arbeiten|lernen|spielen|lesen|schreiben|hören|fragen|antworten|glauben|denken|bringen|nutzen|benutzen|fahren|laufen|bleiben|liegen|stellen|stehen|legen|setzen|gehören|verlieren|gewinnen|bieten|folgen|scheinen|erinnern|lieben|hassen|öffnen|schließen|warten|hoffen|ändern|feiern|erklären|vergessen|erkennen|entwickeln|erreichen|erhalten|verdienen|handeln|reden|teilen|wählen|erzählen|versuchen|stören|gefallen|bezahlen|bestellen|reservieren|besuchen|rauchen|schmecken|kosten|danken|gratulieren|fehlen|passieren|funktionieren|reparieren|duschen|baden|waschen|putzen|kochen|backen|braten|schneiden|mischen|rühren|wiegen|messen|testen|prüfen|analysieren|installieren|kopieren|drucken|speichern|löschen|senden|empfangen|laden|starten|stoppen|beenden|schlafen|aufstehen|aufwachen|frühstücken|reisen|fliegen|schwimmen|wandern|tanzen|singen|malen|zeichnen|fotografieren|üben|trainieren|studieren|unterrichten|lehren|forschen|diskutieren|streiten|versprechen|lügen|betrügen|stehlen|töten|sterben|geborenwerden|wachsen|blühen|welken|regnen|schneien|hageln|donnern|blitzen)\b/i;
              if (!verbPatterns.test(prompt.text)) {
                // This is a warning, not an error (for now)
                console.warn(`⚠️  Item ${itemIdx} pack entry prompt ${pIdx} text may not contain a verb-like token: "${prompt.text.substring(0, 50)}..."`);
              }
            }

            // Validate slots (optional)
            if (prompt.slots !== undefined) {
              if (typeof prompt.slots !== 'object' || prompt.slots === null || Array.isArray(prompt.slots)) {
                addError(contextFile, `Item ${itemIdx} pack entry prompt ${pIdx} slots must be an object if present`);
              } else {
                const slotKeys = Object.keys(prompt.slots);
                for (const slotKey of slotKeys) {
                  if (!VALID_SLOT_KEYS.includes(slotKey)) {
                    addError(contextFile, `Item ${itemIdx} pack entry prompt ${pIdx} slots has invalid key "${slotKey}". Valid keys are: ${VALID_SLOT_KEYS.join(', ')}`);
                  } else {
                    const slotValue = prompt.slots[slotKey];
                    if (!Array.isArray(slotValue)) {
                      addError(contextFile, `Item ${itemIdx} pack entry prompt ${pIdx} slots["${slotKey}"] must be an array`);
                    } else {
                      // Validate that slot values are substrings of text
                      const promptText = prompt.text || '';
                      slotValue.forEach((slotText: any, sIdx: number) => {
                        if (typeof slotText !== 'string') {
                          addError(contextFile, `Item ${itemIdx} pack entry prompt ${pIdx} slots["${slotKey}"][${sIdx}] must be a string`);
                        } else if (!promptText.includes(slotText)) {
                          addError(contextFile, `Item ${itemIdx} pack entry prompt ${pIdx} slots["${slotKey}"][${sIdx}] value "${slotText}" is not a substring of prompt text "${promptText}"`);
                        }
                      });
                    }
                  }
                }
              }
            }

            // Prompt Meaning Contract v1: Validate meaning contract fields
            validatePromptMeaningContract(prompt, entry, contextFile, itemIdx, pIdx);

          });

          // Validate promptId uniqueness within pack
          const promptIds = entry.prompts.map((p: any) => p.id).filter(Boolean);
          const uniquePromptIds = new Set(promptIds);
          if (promptIds.length !== uniquePromptIds.size) {
            const duplicates = promptIds.filter((id: string, idx: number) => promptIds.indexOf(id) !== idx);
            addError(contextFile, `Item ${itemIdx} pack entry has duplicate prompt IDs: ${[...new Set(duplicates)].join(', ')}. Each prompt must have a unique id.`);
          }
        }

        // Quality Gates v1: Validate pack quality
        if (entry.prompts && Array.isArray(entry.prompts) && entry.prompts.length > 0) {
          validatePackQualityGates(entry, contextFile, itemIdx);
        }

        // Analytics validation: required for generated content, optional for handcrafted
        validatePackAnalytics(entry, contextFile, itemIdx);
      }
      // If promptsUrl is used instead, validate it's a string
      if (entry.promptsUrl !== undefined && typeof entry.promptsUrl !== 'string') {
        addError(contextFile, `Item ${itemIdx} pack entry promptsUrl must be a string if present`);
      }
    }

    // Exam-specific validation
    if (normalizedKind === 'exam') {
      if (!entry.level || typeof entry.level !== 'string') {
        addError(contextFile, `Item ${itemIdx} exam entry missing or invalid field: level (must be string)`);
      }
      // Description is optional for exams
      if (entry.description !== undefined && typeof entry.description !== 'string') {
        addError(contextFile, `Item ${itemIdx} exam entry description must be a string if present`);
      }
    }

    // Drill-specific validation
    if (normalizedKind === 'drill') {
      // Level is optional for drills
      if (entry.level !== undefined && typeof entry.level !== 'string') {
        addError(contextFile, `Item ${itemIdx} drill entry level must be a string if present`);
      }
      // Description is optional for drills
      if (entry.description !== undefined && typeof entry.description !== 'string') {
        addError(contextFile, `Item ${itemIdx} drill entry description must be a string if present`);
      }

      // Analytics metadata validation (required for all drills)
      if (!entry.analytics || typeof entry.analytics !== 'object') {
        addError(contextFile, `Item ${itemIdx} drill entry missing or invalid field: analytics (must be object)`);
      } else {
        validateDrillAnalytics(entry.analytics, entry, contextFile, itemIdx);
      }

      // Drill quality gates (for prompts-based drills)
      if (entry.prompts && Array.isArray(entry.prompts) && entry.prompts.length > 0) {
        validateDrillQualityGates(entry, contextFile, itemIdx);
      }

      // Drills can have either prompts array OR promptsUrl (for session engine playability)
      const hasPrompts = entry.prompts && Array.isArray(entry.prompts) && entry.prompts.length > 0;
      const hasPromptsUrl = entry.promptsUrl && typeof entry.promptsUrl === 'string';
      const hasExercises = entry.exercises && Array.isArray(entry.exercises) && entry.exercises.length > 0;

      // At least one content delivery method is required: prompts, promptsUrl, or exercises
      if (!hasPrompts && !hasPromptsUrl && !hasExercises) {
        addError(contextFile, `Item ${itemIdx} drill entry must have either: prompts array, promptsUrl, or exercises array`);
      }

      // Validate promptsUrl pattern if present
      if (hasPromptsUrl) {
        const promptsUrlPattern = /^\/v1\/workspaces\/[^/]+\/drills\/[^/]+\/prompts\.json$/;
        if (!promptsUrlPattern.test(entry.promptsUrl)) {
          addError(contextFile, `Item ${itemIdx} drill entry promptsUrl does not match canonical pattern: /v1/workspaces/{workspace}/drills/{id}/prompts.json`);
        }
      }

      // Validate prompts array if present
      if (hasPrompts) {
        entry.prompts.forEach((prompt: any, pIdx: number) => {
          if (!prompt.id || typeof prompt.id !== 'string') {
            addError(contextFile, `Item ${itemIdx} drill entry prompt ${pIdx} missing or invalid field: id`);
          }
          if (!prompt.text || typeof prompt.text !== 'string') {
            addError(contextFile, `Item ${itemIdx} drill entry prompt ${pIdx} missing or invalid field: text`);
          } else {
            // Prompt quality guardrails
            if (prompt.text.length < MIN_PROMPT_TEXT_LENGTH) {
              addError(contextFile, `Item ${itemIdx} drill entry prompt ${pIdx} text is too short (${prompt.text.length} chars). Min is ${MIN_PROMPT_TEXT_LENGTH} chars.`);
            }
            if (prompt.text.length > MAX_PROMPT_TEXT_LENGTH) {
              addError(contextFile, `Item ${itemIdx} drill entry prompt ${pIdx} text is too long (${prompt.text.length} chars). Max is ${MAX_PROMPT_TEXT_LENGTH} chars.`);
            }
          }
        });
      }

      // Validate sessionPlan if prompts or promptsUrl is present (required for session engine playability)
      if (hasPrompts || hasPromptsUrl) {
        if (!entry.sessionPlan || typeof entry.sessionPlan !== 'object') {
          addError(contextFile, `Item ${itemIdx} drill entry has prompts but missing sessionPlan (required for session engine playability)`);
        } else {
          // Validate sessionPlan.version
          if (entry.sessionPlan.version !== 1) {
            addError(contextFile, `Item ${itemIdx} drill entry sessionPlan.version must be 1`);
          }

          // Validate sessionPlan.steps
          if (!Array.isArray(entry.sessionPlan.steps) || entry.sessionPlan.steps.length === 0) {
            addError(contextFile, `Item ${itemIdx} drill entry sessionPlan.steps must be a non-empty array`);
          } else {
            entry.sessionPlan.steps.forEach((step: any, sIdx: number) => {
              if (!step.id || typeof step.id !== 'string') {
                addError(contextFile, `Item ${itemIdx} drill entry sessionPlan.steps[${sIdx}] missing or invalid field: id (must be string)`);
              }
              if (!step.title || typeof step.title !== 'string') {
                addError(contextFile, `Item ${itemIdx} drill entry sessionPlan.steps[${sIdx}] missing or invalid field: title (must be string)`);
              }
              if (!Array.isArray(step.promptIds) || step.promptIds.length === 0) {
                addError(contextFile, `Item ${itemIdx} drill entry sessionPlan.steps[${sIdx}] missing or invalid field: promptIds (must be non-empty array)`);
              } else {
                // Validate each promptId is a string
                step.promptIds.forEach((promptId: any, pIdIdx: number) => {
                  if (typeof promptId !== 'string') {
                    addError(contextFile, `Item ${itemIdx} drill entry sessionPlan.steps[${sIdx}].promptIds[${pIdIdx}] must be a string`);
                  }
                });
              }
            });

            // Validate that all referenced promptIds exist in prompts array (if inline prompts)
            if (hasPrompts) {
              const promptIds = new Set(entry.prompts.map((p: any) => p.id).filter(Boolean));
              entry.sessionPlan.steps.forEach((step: any, sIdx: number) => {
                if (Array.isArray(step.promptIds)) {
                  step.promptIds.forEach((promptId: string) => {
                    if (!promptIds.has(promptId)) {
                      addError(contextFile, `Item ${itemIdx} drill entry sessionPlan.steps[${sIdx}] references promptId "${promptId}" which does not exist in prompts array`);
                    }
                  });
                }
              });
            }
            // If promptsUrl is used, we can't validate promptIds exist (they're in external file)
          }
        }

        // Warn if outline.length doesn't match steps.length (non-fatal)
        if (entry.sessionPlan && Array.isArray(entry.outline) && Array.isArray(entry.sessionPlan.steps) && entry.outline.length !== entry.sessionPlan.steps.length) {
          console.warn(`⚠️  Item ${itemIdx} drill entry outline.length (${entry.outline.length}) does not match sessionPlan.steps.length (${entry.sessionPlan.steps.length}). This is allowed but may indicate a mismatch.`);
        }
      }

      // Drill v4 specific validation
      if (entry.drillVersion === 'v4') {
        // Required v4 fields
        if (!entry.workspace || typeof entry.workspace !== 'string') {
          addError(contextFile, `Item ${itemIdx} drill v4 entry missing or invalid field: workspace (must be string)`);
        }
        if (!entry.language || typeof entry.language !== 'string') {
          addError(contextFile, `Item ${itemIdx} drill v4 entry missing or invalid field: language (must be string)`);
        }
        if (!entry.shortTitle || typeof entry.shortTitle !== 'string') {
          addError(contextFile, `Item ${itemIdx} drill v4 entry missing or invalid field: shortTitle (must be string)`);
        } else if (entry.shortTitle.length > 28) {
          addError(contextFile, `Item ${itemIdx} drill v4 entry shortTitle is too long (${entry.shortTitle.length} chars). Max is 28 chars.`);
        }
        if (!entry.subtitle || typeof entry.subtitle !== 'string') {
          addError(contextFile, `Item ${itemIdx} drill v4 entry missing or invalid field: subtitle (must be string)`);
        } else {
          if (entry.subtitle.length < 40 || entry.subtitle.length > 60) {
            addError(contextFile, `Item ${itemIdx} drill v4 entry subtitle length is invalid (${entry.subtitle.length} chars). Must be 40-60 chars.`);
          }
        }
        if (!entry.mechanicId || typeof entry.mechanicId !== 'string') {
          addError(contextFile, `Item ${itemIdx} drill v4 entry missing or invalid field: mechanicId (must be string)`);
        }
        if (!entry.mechanicLabel || typeof entry.mechanicLabel !== 'string') {
          addError(contextFile, `Item ${itemIdx} drill v4 entry missing or invalid field: mechanicLabel (must be string)`);
        }
        if (!entry.loopType || typeof entry.loopType !== 'string') {
          addError(contextFile, `Item ${itemIdx} drill v4 entry missing or invalid field: loopType (must be string)`);
        } else {
          const validLoopTypes = ['pattern_switch', 'slot_substitution', 'micro_transform', 'fast_recall', 'contrast_pairs', 'error_trap'];
          if (!validLoopTypes.includes(entry.loopType)) {
            addError(contextFile, `Item ${itemIdx} drill v4 entry loopType "${entry.loopType}" is invalid. Must be one of: ${validLoopTypes.join(', ')}`);
          }
        }
        if (typeof entry.difficultyTier !== 'number') {
          addError(contextFile, `Item ${itemIdx} drill v4 entry missing or invalid field: difficultyTier (must be number)`);
        } else if (entry.difficultyTier < 1 || entry.difficultyTier > 3) {
          addError(contextFile, `Item ${itemIdx} drill v4 entry difficultyTier (${entry.difficultyTier}) must be 1, 2, or 3`);
        }
        if (!Array.isArray(entry.variationSlots) || entry.variationSlots.length === 0) {
          addError(contextFile, `Item ${itemIdx} drill v4 entry missing or invalid field: variationSlots (must be non-empty array)`);
        }
        if (typeof entry.estimatedMinutes !== 'number') {
          addError(contextFile, `Item ${itemIdx} drill v4 entry missing or invalid field: estimatedMinutes (must be number)`);
        } else if (entry.estimatedMinutes < 2 || entry.estimatedMinutes > 6) {
          addError(contextFile, `Item ${itemIdx} drill v4 entry estimatedMinutes (${entry.estimatedMinutes}) must be between 2 and 6`);
        }

        // Validate v4 analytics structure
        if (entry.analytics && typeof entry.analytics === 'object') {
          if (!entry.analytics.mechanicId || typeof entry.analytics.mechanicId !== 'string') {
            addError(contextFile, `Item ${itemIdx} drill v4 entry analytics.mechanicId missing or invalid`);
          }
          if (!entry.analytics.loopType || typeof entry.analytics.loopType !== 'string') {
            addError(contextFile, `Item ${itemIdx} drill v4 entry analytics.loopType missing or invalid`);
          }
          if (!Array.isArray(entry.analytics.targetStructures)) {
            addError(contextFile, `Item ${itemIdx} drill v4 entry analytics.targetStructures must be an array`);
          }
          if (!entry.analytics.qualitySignals || typeof entry.analytics.qualitySignals !== 'object') {
            addError(contextFile, `Item ${itemIdx} drill v4 entry analytics.qualitySignals missing or invalid`);
          } else {
            if (typeof entry.analytics.qualitySignals.multiSlotRate !== 'number') {
              addError(contextFile, `Item ${itemIdx} drill v4 entry analytics.qualitySignals.multiSlotRate missing or invalid`);
            }
            if (typeof entry.analytics.qualitySignals.bannedPhraseCheckPassed !== 'boolean') {
              addError(contextFile, `Item ${itemIdx} drill v4 entry analytics.qualitySignals.bannedPhraseCheckPassed missing or invalid`);
            }
          }
        }
      }
    }

    // Track-specific validation
    if (normalizedKind === 'track') {
      if (!entry.level || typeof entry.level !== 'string') {
        addError(contextFile, `Item ${itemIdx} track entry missing or invalid field: level (must be string)`);
      }
      if (!entry.scenario || typeof entry.scenario !== 'string') {
        addError(contextFile, `Item ${itemIdx} track entry missing or invalid field: scenario (must be string)`);
      }
      if (!entry.description || typeof entry.description !== 'string') {
        addError(contextFile, `Item ${itemIdx} track entry missing or invalid field: description (must be string)`);
      }
      if (!Array.isArray(entry.items) || entry.items.length === 0) {
        addError(contextFile, `Item ${itemIdx} track entry missing or invalid field: items (must be non-empty array)`);
      } else {
        // Validate items array (6-14 items recommended)
        if (entry.items.length < 6) {
          addError(contextFile, `Item ${itemIdx} track entry items array too short (${entry.items.length} items, minimum 6)`);
        }
        if (entry.items.length > 14) {
          addError(contextFile, `Item ${itemIdx} track entry items array too long (${entry.items.length} items, maximum 14)`);
        }

        // Validate each item
        const seenEntryUrls = new Set<string>();
        entry.items.forEach((item: any, itemIdx: number) => {
          if (!item.kind || typeof item.kind !== 'string') {
            addError(contextFile, `Item ${itemIdx} track entry items[${itemIdx}] missing or invalid field: kind (must be "pack" or "drill")`);
          } else if (!['pack', 'drill'].includes(item.kind.toLowerCase())) {
            addError(contextFile, `Item ${itemIdx} track entry items[${itemIdx}] kind must be "pack" or "drill"`);
          }

          if (!item.entryUrl || typeof item.entryUrl !== 'string') {
            addError(contextFile, `Item ${itemIdx} track entry items[${itemIdx}] missing or invalid field: entryUrl (must be string)`);
          } else {
            // Validate entryUrl pattern matches kind
            const itemKind = item.kind.toLowerCase();
            if (itemKind === 'pack') {
              const packPattern = /^\/v1\/workspaces\/[^/]+\/packs\/[^/]+\/pack\.json$/;
              if (!packPattern.test(item.entryUrl)) {
                addError(contextFile, `Item ${itemIdx} track entry items[${itemIdx}] entryUrl does not match pack pattern: ${item.entryUrl}`);
              }
            } else if (itemKind === 'drill') {
              const drillPattern = /^\/v1\/workspaces\/[^/]+\/drills\/[^/]+\/drill\.json$/;
              if (!drillPattern.test(item.entryUrl)) {
                addError(contextFile, `Item ${itemIdx} track entry items[${itemIdx}] entryUrl does not match drill pattern: ${item.entryUrl}`);
              }
            }

            // Validate entryUrl exists
            const entryPath = resolveContentPath(item.entryUrl);
            if (!existsSync(entryPath)) {
              // Legacy tracks may reference old content - warn instead of error
              console.warn(`⚠️  ${contextFile}: Item ${itemIdx} track entry items[${itemIdx}] entryUrl does not exist: ${item.entryUrl} (legacy track)`);
            } else {
              // Validate referenced entry document
              validateEntryDocument(entryPath, item.kind, contextFile, itemIdx);

              // Validate scenario consistency (packs must match track scenario, drills may omit)
              if (item.kind === 'pack') {
                try {
                  const entryContent = readFileSync(entryPath, 'utf-8');
                  const referencedEntry = JSON.parse(entryContent);
                  if (entry.scenario && referencedEntry.scenario && entry.scenario !== referencedEntry.scenario) {
                    addError(contextFile, `Item ${itemIdx} track entry items[${itemIdx}] pack scenario "${referencedEntry.scenario}" does not match track scenario "${entry.scenario}"`);
                  }
                } catch (err: any) {
                  // Entry validation will catch parse errors
                }
              }
            }

            // Check for duplicate entryUrls
            if (seenEntryUrls.has(item.entryUrl)) {
              addError(contextFile, `Item ${itemIdx} track entry items[${itemIdx}] duplicate entryUrl: ${item.entryUrl}`);
            }
            seenEntryUrls.add(item.entryUrl);
          }

          if (item.required !== undefined && typeof item.required !== 'boolean') {
            addError(contextFile, `Item ${itemIdx} track entry items[${itemIdx}] required must be boolean if present`);
          }
        });
      }

      // Validate ordering
      if (!entry.ordering || typeof entry.ordering !== 'object') {
        addError(contextFile, `Item ${itemIdx} track entry missing or invalid field: ordering (must be object)`);
      } else {
        if (!entry.ordering.type || entry.ordering.type !== 'fixed') {
          addError(contextFile, `Item ${itemIdx} track entry ordering.type must be "fixed" (deterministic ordering required)`);
        }
      }

      // Validate version
      if (typeof entry.version !== 'number') {
        addError(contextFile, `Item ${itemIdx} track entry missing or invalid field: version (must be number)`);
      } else if (entry.version !== 1) {
        addError(contextFile, `Item ${itemIdx} track entry version must be 1 (got ${entry.version})`);
      }
    }
  } catch (err: any) {
    addError(contextFile, `Item ${itemIdx} entry document validation failed: ${err.message}`);
  }
}

function validateJsonPath(path: string, context: string): void {
  if (!isValidJsonPath(path)) {
    return; // Not a JSON path, skip
  }

  const resolvedPath = resolveContentPath(path);
  if (!existsSync(resolvedPath)) {
    addError(context, `Referenced path does not exist: ${path} (resolved to: ${resolvedPath})`);
  }
}

function validateJsonPaths(obj: any, context: string): void {
  if (typeof obj !== 'object' || obj === null) {
    return;
  }

  if (Array.isArray(obj)) {
    obj.forEach((item, idx) => {
      if (typeof item === 'string' && isValidJsonPath(item)) {
        validateJsonPath(item, `${context}[${idx}]`);
      } else if (typeof item === 'object') {
        validateJsonPaths(item, `${context}[${idx}]`);
      }
    });
  } else {
    for (const [key, value] of Object.entries(obj)) {
      const newContext = context ? `${context}.${key}` : key;

      if (typeof value === 'string' && isValidJsonPath(value)) {
        validateJsonPath(value, newContext);
      } else if (Array.isArray(value)) {
        value.forEach((item, idx) => {
          if (typeof item === 'string' && isValidJsonPath(item)) {
            validateJsonPath(item, `${newContext}[${idx}]`);
          } else if (typeof item === 'object') {
            validateJsonPaths(item, `${newContext}[${idx}]`);
          }
        });
      } else if (typeof value === 'object' && value !== null) {
        validateJsonPaths(value, newContext);
      }
    }
  }
}

function findJsonFiles(dir: string, fileList: string[] = []): string[] {
  const files = readdirSync(dir);
  files.forEach(file => {
    const filePath = join(dir, file);
    const stat = statSync(filePath);
    if (stat.isDirectory()) {
      findJsonFiles(filePath, fileList);
    } else if (file.endsWith('.json')) {
      fileList.push(filePath);
    }
  });
  return fileList;
}

function validateCatalog(catalogPath: string): void {
  try {
    const content = readFileSync(catalogPath, 'utf-8');
    const catalog = JSON.parse(content);

    // Validate schemaVersion first
    validateSchemaVersion('Catalog', catalog, catalogPath);

    // Validate required fields (schemaVersion validation also checks these, but keep for clarity)
    if (!catalog.workspace) {
      addError(catalogPath, 'Missing required field: workspace');
    }
    // Accept either old schema (language) or new schema (languageCode + languageName)
    if (!catalog.language && (!catalog.languageCode || !catalog.languageName)) {
      addError(catalogPath, 'Missing required field: either "language" (old schema) or both "languageCode" and "languageName" (new schema)');
    }
    if (!Array.isArray(catalog.sections)) {
      addError(catalogPath, 'Missing or invalid field: sections (must be an array)');
      return;
    }

    // Validate sections
    catalog.sections.forEach((section: any, idx: number) => {
      if (!section.id || typeof section.id !== 'string') {
        addError(catalogPath, `Section ${idx} missing or invalid field: id (must be string)`);
      }
      if (!section.kind || typeof section.kind !== 'string') {
        addError(catalogPath, `Section ${idx} missing or invalid field: kind (must be string)`);
      }
      if (!section.title || typeof section.title !== 'string') {
        addError(catalogPath, `Section ${idx} missing or invalid field: title (must be string)`);
      }

      // Validate analyticsRollup if present
      if (section.analyticsRollup !== undefined) {
        if (typeof section.analyticsRollup !== 'object' || section.analyticsRollup === null) {
          addError(catalogPath, `Section ${idx} analyticsRollup must be an object if present`);
        } else {
          if (section.analyticsRollup.scenarios !== undefined) {
            if (typeof section.analyticsRollup.scenarios !== 'object' || Array.isArray(section.analyticsRollup.scenarios)) {
              addError(catalogPath, `Section ${idx} analyticsRollup.scenarios must be an object if present`);
            }
          }
          if (section.analyticsRollup.levels !== undefined) {
            if (typeof section.analyticsRollup.levels !== 'object' || Array.isArray(section.analyticsRollup.levels)) {
              addError(catalogPath, `Section ${idx} analyticsRollup.levels must be an object if present`);
            }
          }
          if (section.analyticsRollup.primaryStructures !== undefined) {
            if (typeof section.analyticsRollup.primaryStructures !== 'object' || Array.isArray(section.analyticsRollup.primaryStructures)) {
              addError(catalogPath, `Section ${idx} analyticsRollup.primaryStructures must be an object if present`);
            }
          }
        }
      }
    });

    // Validate JSON paths in catalog
    validateJsonPaths(catalog, `catalog.json`);
  } catch (err: any) {
    addError(catalogPath, `Failed to parse JSON: ${err.message}`);
  }
}

// Valid CEFR levels
const VALID_CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

// Reasonable duration bounds
const MIN_DURATION_MINUTES = 1;
const MAX_DURATION_MINUTES = 120;

// Title length bounds
const MAX_TITLE_LENGTH = 100;

// Prompt quality bounds
const MIN_PROMPT_TEXT_LENGTH = 12;
const MAX_PROMPT_TEXT_LENGTH = 140;

// Primary structure bounds
const MAX_PRIMARY_STRUCTURE_ID_LENGTH = 40;
const MAX_PRIMARY_STRUCTURE_LABEL_LENGTH = 80;

// Micro notes bounds
const MAX_MICRO_NOTE_LENGTH = 240;

// Valid slot keys for prompt slots
const VALID_SLOT_KEYS = ['subject', 'verb', 'object', 'modifier', 'complement'];

// Prompt Meaning Contract v1: Valid intent values
const VALID_INTENTS = ['greet', 'request', 'apologize', 'inform', 'ask', 'confirm', 'schedule', 'order', 'ask_price', 'thank', 'goodbye'];

// Prompt Meaning Contract v1: Valid register values
const VALID_REGISTERS = ['formal', 'neutral', 'informal', 'casual'];

// Prompt Meaning Contract v1: German tokens that should not appear in gloss_en (literal translation check)
const GERMAN_TOKENS_IN_GLOSS = ['bitte', 'termin', 'entschuldigung', 'entschuldige', 'entschuldigen', 'guten tag', 'guten morgen', 'guten abend', 'auf wiedersehen', 'tschüss', 'danke', 'bitte schön', 'gern geschehen', 'vielen dank', 'kein problem', 'keine ursache', 'wie geht es', 'wie gehts', 'was ist los', 'was machst du', 'wie heißt du', 'woher kommst du', 'wo wohnst du', 'wie alt bist du', 'was machst du beruflich', 'ich heiße', 'ich komme aus', 'ich wohne in', 'ich bin', 'ich habe', 'ich kann', 'ich muss', 'ich will', 'ich möchte', 'ich würde', 'ich könnte', 'ich sollte', 'ich dürfte'];

// Quality Gates v1: Generic template denylist
const DENYLIST_PHRASES = [
  "in today's lesson",
  "let's practice",
  "this sentence",
  "i like to",
  "the quick brown fox",
  "lorem ipsum"
];

// Quality Gates v1: Pronouns for subject detection (German + English)
const GERMAN_PRONOUNS = ['ich', 'du', 'wir', 'sie', 'er', 'es', 'ihr', 'Sie'];
const ENGLISH_PRONOUNS = ['i', 'you', 'we', 'they', 'he', 'she', 'it'];
const ALL_PRONOUNS = [...GERMAN_PRONOUNS, ...ENGLISH_PRONOUNS];

// Quality Gates v1: Weekday tokens (German + English)
const WEEKDAY_TOKENS = ['montag', 'dienstag', 'mittwoch', 'donnerstag', 'freitag', 'samstag', 'sonntag', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

// Schema versioning
const SUPPORTED_SCHEMA_VERSIONS = [1];

/**
 * Validate schemaVersion field
 * Hard-fails on missing or unknown versions
 */
/**
 * Prompt Meaning Contract v1: Load calque denylist
 */
function loadCalqueDenylist(): string[] {
  try {
    const denylistPath = join(META_DIR, 'denylists', 'de_calques.json');
    if (!existsSync(denylistPath)) {
      return [];
    }
    const content = readFileSync(denylistPath, 'utf-8');
    const denylist = JSON.parse(content);
    return denylist.phrases || [];
  } catch (err: any) {
    console.warn(`⚠️  Failed to load calque denylist: ${err.message}`);
    return [];
  }
}

/**
 * Prompt Meaning Contract v1: Load pragmatics rules
 */
function loadPragmaticsRules(): any[] {
  try {
    const rulesPath = join(META_DIR, 'pragmatics', 'de_rules.json');
    if (!existsSync(rulesPath)) {
      return [];
    }
    const content = readFileSync(rulesPath, 'utf-8');
    const rules = JSON.parse(content);
    return rules.rules || [];
  } catch (err: any) {
    console.warn(`⚠️  Failed to load pragmatics rules: ${err.message}`);
    return [];
  }
}

/**
 * Prompt Meaning Contract v1: Check if text contains German tokens (literal translation check)
 */
function containsGermanTokens(text: string): boolean {
  const textLower = text.toLowerCase();
  for (const token of GERMAN_TOKENS_IN_GLOSS) {
    if (textLower.includes(token.toLowerCase())) {
      return true;
    }
  }
  return false;
}

/**
 * Prompt Meaning Contract v1: Check if prompt matches a pragmatics rule
 */
function matchesPragmaticsRule(prompt: any, entry: any, rule: any): boolean {
  const match = rule.match || {};

  // Check scenario
  if (match.scenario && entry.scenario !== match.scenario) {
    return false;
  }

  // Check intent
  if (match.intent) {
    const ruleIntents = Array.isArray(match.intent) ? match.intent : [match.intent];
    if (!ruleIntents.includes(prompt.intent)) {
      return false;
    }
  }

  // Check register
  if (match.register) {
    const promptRegister = prompt.register || entry.register;
    const ruleRegisters = Array.isArray(match.register) ? match.register : [match.register];
    if (!ruleRegisters.includes(promptRegister)) {
      return false;
    }
  }

  // Check primaryStructure
  if (match.primaryStructure && entry.primaryStructure !== match.primaryStructure) {
    return false;
  }

  return true;
}

/**
 * Prompt Meaning Contract v1: Check if prompt satisfies pragmatics rule requirements
 */
function satisfiesPragmaticsRule(prompt: any, rule: any): boolean {
  const textLower = prompt.text.toLowerCase().replace(/\s+/g, ' ');

  // Check requireAnyTokens (at least one must appear)
  if (rule.requireAnyTokens && rule.requireAnyTokens.length > 0) {
    let found = false;
    for (const token of rule.requireAnyTokens) {
      const tokenLower = token.toLowerCase();
      if (textLower.includes(tokenLower)) {
        found = true;
        break;
      }
    }
    if (!found) {
      return false;
    }
  }

  // Check forbidTokens (none may appear)
  if (rule.forbidTokens && rule.forbidTokens.length > 0) {
    for (const token of rule.forbidTokens) {
      const tokenLower = token.toLowerCase();
      if (textLower.includes(tokenLower)) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Prompt Meaning Contract v1: Compute similarity between two texts
 */
function computeTextSimilarity(text1: string, text2: string): number {
  // Normalize texts
  const norm1 = text1.toLowerCase().replace(/[.,!?;:]/g, '').replace(/\s+/g, ' ').trim();
  const norm2 = text2.toLowerCase().replace(/[.,!?;:]/g, '').replace(/\s+/g, ' ').trim();

  if (norm1 === norm2) return 1.0;
  if (norm1.length === 0 || norm2.length === 0) return 0;

  // Jaccard similarity (token overlap)
  const tokens1 = new Set(norm1.split(/\s+/));
  const tokens2 = new Set(norm2.split(/\s+/));
  const intersection = new Set([...tokens1].filter(x => tokens2.has(x)));
  const union = new Set([...tokens1, ...tokens2]);
  const jaccard = union.size > 0 ? intersection.size / union.size : 0;

  // Simple Levenshtein distance (normalized)
  const maxLen = Math.max(norm1.length, norm2.length);
  let distance = 0;
  const minLen = Math.min(norm1.length, norm2.length);
  for (let i = 0; i < minLen; i++) {
    if (norm1[i] !== norm2[i]) distance++;
  }
  distance += Math.abs(norm1.length - norm2.length);
  const editSimilarity = 1 - (distance / maxLen);

  // Weighted average
  return (jaccard * 0.7) + (editSimilarity * 0.3);
}

/**
 * Prompt Meaning Contract v1: Validate prompt meaning contract
 */
function validatePromptMeaningContract(prompt: any, entry: any, contextFile: string, itemIdx: number, pIdx: number): void {
  // Meaning-safety gate: If pack is approved and generated, gloss_en and intent must be non-empty
  const provenance = entry.provenance;
  const review = entry.review;
  const isApprovedGenerated = review && review.status === 'approved' && provenance && provenance.source !== 'handcrafted';

  // 1. Validate intent (required)
  if (!prompt.intent || typeof prompt.intent !== 'string') {
    addError(contextFile, `Item ${itemIdx} pack entry prompt ${pIdx} missing or invalid field: intent (required, must be one of: ${VALID_INTENTS.join(', ')})`);
  } else if (!VALID_INTENTS.includes(prompt.intent)) {
    addError(contextFile, `Item ${itemIdx} pack entry prompt ${pIdx} invalid intent "${prompt.intent}". Must be one of: ${VALID_INTENTS.join(', ')}`);
  } else if (isApprovedGenerated && prompt.intent.trim() === '') {
    addError(contextFile, `Item ${itemIdx} pack entry prompt ${pIdx} intent is empty (required for approved generated content)`);
  }

  // 2. Validate register (optional, but if present must be valid)
  if (prompt.register !== undefined) {
    if (typeof prompt.register !== 'string' || !VALID_REGISTERS.includes(prompt.register)) {
      addError(contextFile, `Item ${itemIdx} pack entry prompt ${pIdx} invalid register "${prompt.register}". Must be one of: ${VALID_REGISTERS.join(', ')}`);
    }
  }

  // Validate pack-level register
  if (entry.register && typeof entry.register === 'string' && !VALID_REGISTERS.includes(entry.register)) {
    addError(contextFile, `Item ${itemIdx} pack entry invalid register "${entry.register}". Must be one of: ${VALID_REGISTERS.join(', ')}`);
  }

  // 3. Validate gloss_en (required)
  if (!prompt.gloss_en || typeof prompt.gloss_en !== 'string') {
    addError(contextFile, `Item ${itemIdx} pack entry prompt ${pIdx} missing or invalid field: gloss_en (required, 6-180 chars)`);
  } else {
    // Meaning-safety: approved generated content must have non-empty gloss_en
    if (isApprovedGenerated && prompt.gloss_en.trim() === '') {
      addError(contextFile, `Item ${itemIdx} pack entry prompt ${pIdx} gloss_en is empty (required for approved generated content)`);
    }

    if (prompt.gloss_en.length < 6) {
      addError(contextFile, `Item ${itemIdx} pack entry prompt ${pIdx} gloss_en is too short (${prompt.gloss_en.length} chars). Min is 6 chars.`);
    }
    if (prompt.gloss_en.length > 180) {
      addError(contextFile, `Item ${itemIdx} pack entry prompt ${pIdx} gloss_en is too long (${prompt.gloss_en.length} chars). Max is 180 chars.`);
    }

    // Check for German tokens (literal translation)
    if (containsGermanTokens(prompt.gloss_en)) {
      addError(contextFile, `Item ${itemIdx} pack entry prompt ${pIdx} gloss_en contains German tokens (literal translation). gloss_en must be natural English, not a word-for-word translation.`);
    }
  }

  // 4. Validate natural_en (required for government_office or A2+)
  const scenario = entry.scenario || '';
  const level = entry.level || '';
  const isGovernmentOffice = scenario === 'government_office';
  const isA2OrHigher = ['A2', 'B1', 'B2', 'C1', 'C2'].includes(level.toUpperCase());
  const requiresNaturalEn = isGovernmentOffice || isA2OrHigher;

  if (requiresNaturalEn) {
    if (!prompt.natural_en || typeof prompt.natural_en !== 'string') {
      addError(contextFile, `Item ${itemIdx} pack entry prompt ${pIdx} missing or invalid field: natural_en (required for ${isGovernmentOffice ? 'government_office scenario' : 'A2+ level'}, 6-180 chars)`);
    } else {
      if (prompt.natural_en.length < 6) {
        addError(contextFile, `Item ${itemIdx} pack entry prompt ${pIdx} natural_en is too short (${prompt.natural_en.length} chars). Min is 6 chars.`);
      }
      if (prompt.natural_en.length > 180) {
        addError(contextFile, `Item ${itemIdx} pack entry prompt ${pIdx} natural_en is too long (${prompt.natural_en.length} chars). Max is 180 chars.`);
      }

      // Check for German tokens (literal translation)
      if (containsGermanTokens(prompt.natural_en)) {
        addError(contextFile, `Item ${itemIdx} pack entry prompt ${pIdx} natural_en contains German tokens (literal translation). natural_en must be natural English, not a word-for-word translation.`);
      }

      // Warn if natural_en is identical to gloss_en (should be different)
      if (prompt.gloss_en && prompt.natural_en === prompt.gloss_en) {
        addError(contextFile, `Item ${itemIdx} pack entry prompt ${pIdx} natural_en should differ from gloss_en (natural_en should be a native English paraphrase, not identical to gloss_en)`);
      }
    }
  } else {
    // For A1 non-government scenarios: optional but recommended
    if (!prompt.natural_en) {
      // Warning only, not an error
      console.warn(`⚠️  Item ${itemIdx} pack entry prompt ${pIdx} missing natural_en (recommended for all prompts, optional for A1 non-government scenarios)`);
    } else if (typeof prompt.natural_en !== 'string') {
      addError(contextFile, `Item ${itemIdx} pack entry prompt ${pIdx} natural_en must be a string if present`);
    } else {
      if (prompt.natural_en.length < 6) {
        addError(contextFile, `Item ${itemIdx} pack entry prompt ${pIdx} natural_en is too short (${prompt.natural_en.length} chars). Min is 6 chars.`);
      }
      if (prompt.natural_en.length > 180) {
        addError(contextFile, `Item ${itemIdx} pack entry prompt ${pIdx} natural_en is too long (${prompt.natural_en.length} chars). Max is 180 chars.`);
      }
    }
  }

  // 5. Validate alt_de (optional)
  if (prompt.alt_de !== undefined) {
    if (typeof prompt.alt_de !== 'string') {
      addError(contextFile, `Item ${itemIdx} pack entry prompt ${pIdx} alt_de must be a string if present`);
    } else {
      if (prompt.alt_de.length < 6) {
        addError(contextFile, `Item ${itemIdx} pack entry prompt ${pIdx} alt_de is too short (${prompt.alt_de.length} chars). Min is 6 chars.`);
      }
      if (prompt.alt_de.length > 240) {
        addError(contextFile, `Item ${itemIdx} pack entry prompt ${pIdx} alt_de is too long (${prompt.alt_de.length} chars). Max is 240 chars.`);
      }

      // Warning: alt_de too similar to text
      if (prompt.text && typeof prompt.text === 'string') {
        const similarity = computeTextSimilarity(prompt.text, prompt.alt_de);
        if (similarity > 0.85) {
          console.warn(`⚠️  Item ${itemIdx} pack entry prompt ${pIdx} alt_de is too similar to text (similarity: ${(similarity * 100).toFixed(1)}%). alt_de should provide meaningful alternative phrasing.`);
        }
      }
    }
  }

  // 5. Check calque denylist
  if (prompt.text && typeof prompt.text === 'string') {
    const calqueDenylist = loadCalqueDenylist();
    const textLower = prompt.text.toLowerCase();
    for (const phrase of calqueDenylist) {
      if (textLower.includes(phrase.toLowerCase())) {
        addError(contextFile, `Item ${itemIdx} pack entry prompt ${pIdx} contains calque phrase "${phrase}" (literal translation). This phrase sounds unnatural in German.`);
        break; // Only report first match
      }
    }
  }

  // 6. Check pragmatics rules
  if (prompt.intent && prompt.text && typeof prompt.text === 'string') {
    const pragmaticsRules = loadPragmaticsRules();
    for (const rule of pragmaticsRules) {
      if (matchesPragmaticsRule(prompt, entry, rule)) {
        if (!satisfiesPragmaticsRule(prompt, rule)) {
          const missing = rule.requireAnyTokens ? rule.requireAnyTokens.join(', ') : '';
          const forbidden = rule.forbidTokens ? rule.forbidTokens.join(', ') : '';
          let msg = `Item ${itemIdx} pack entry prompt ${pIdx} violates pragmatics rule "${rule.id || 'unknown'}": `;
          if (missing) {
            msg += `missing required tokens (at least one of: ${missing})`;
          }
          if (forbidden) {
            msg += missing ? `; ` : '';
            msg += `contains forbidden tokens (none of: ${forbidden})`;
          }
          addError(contextFile, msg);
        }
      }
    }
  }
}

/**
 * Quality Gates v1: Validate pack quality
 */
/**
 * Validate analytics metadata block
 */
function validateAnalytics(analytics: any, entry: any, contextFile: string, itemIdx: number): void {
  // ============================================
  // CATALOG-LEVEL ANALYTICS (REQUIRED)
  // ============================================

  // Validate primaryStructure (required, must match pack)
  if (!analytics.primaryStructure || typeof analytics.primaryStructure !== 'string') {
    addError(contextFile, `Item ${itemIdx} pack entry analytics.primaryStructure missing or invalid (must be string, required)`);
  } else if (entry.primaryStructure && analytics.primaryStructure !== entry.primaryStructure) {
    addError(contextFile, `Item ${itemIdx} pack entry analytics.primaryStructure "${analytics.primaryStructure}" does not match pack.primaryStructure "${entry.primaryStructure}"`);
  }

  // Validate variationSlots (required, must match pack)
  if (!Array.isArray(analytics.variationSlots)) {
    addError(contextFile, `Item ${itemIdx} pack entry analytics.variationSlots missing or invalid (must be array, required)`);
  } else if (entry.variationSlots) {
    const analyticsSlots = [...analytics.variationSlots].sort();
    const packSlots = [...entry.variationSlots].sort();
    if (JSON.stringify(analyticsSlots) !== JSON.stringify(packSlots)) {
      addError(contextFile, `Item ${itemIdx} pack entry analytics.variationSlots does not match pack.variationSlots`);
    }
  }

  // Validate slotSwitchDensity (required, 0-1)
  if (typeof analytics.slotSwitchDensity !== 'number') {
    addError(contextFile, `Item ${itemIdx} pack entry analytics.slotSwitchDensity missing or invalid (must be number 0-1, required)`);
  } else if (analytics.slotSwitchDensity < 0 || analytics.slotSwitchDensity > 1) {
    addError(contextFile, `Item ${itemIdx} pack entry analytics.slotSwitchDensity (${analytics.slotSwitchDensity}) must be between 0.0 and 1.0`);
  }

  // Validate promptDiversityScore (required, 0-1)
  if (typeof analytics.promptDiversityScore !== 'number') {
    addError(contextFile, `Item ${itemIdx} pack entry analytics.promptDiversityScore missing or invalid (must be number 0-1, required)`);
  } else if (analytics.promptDiversityScore < 0 || analytics.promptDiversityScore > 1) {
    addError(contextFile, `Item ${itemIdx} pack entry analytics.promptDiversityScore (${analytics.promptDiversityScore}) must be between 0.0 and 1.0`);
  }

  // Validate scenarioCoverageScore (required, 0-1)
  if (typeof analytics.scenarioCoverageScore !== 'number') {
    addError(contextFile, `Item ${itemIdx} pack entry analytics.scenarioCoverageScore missing or invalid (must be number 0-1, required)`);
  } else if (analytics.scenarioCoverageScore < 0 || analytics.scenarioCoverageScore > 1) {
    addError(contextFile, `Item ${itemIdx} pack entry analytics.scenarioCoverageScore (${analytics.scenarioCoverageScore}) must be between 0.0 and 1.0`);
  }

  // Validate estimatedCognitiveLoad (required, enum)
  const validEstimatedCognitiveLoads = ['low', 'medium', 'high'];
  if (!analytics.estimatedCognitiveLoad || typeof analytics.estimatedCognitiveLoad !== 'string') {
    addError(contextFile, `Item ${itemIdx} pack entry analytics.estimatedCognitiveLoad missing or invalid (must be one of: ${validEstimatedCognitiveLoads.join(', ')}, required)`);
  } else if (!validEstimatedCognitiveLoads.includes(analytics.estimatedCognitiveLoad)) {
    addError(contextFile, `Item ${itemIdx} pack entry analytics.estimatedCognitiveLoad "${analytics.estimatedCognitiveLoad}" is invalid. Must be one of: ${validEstimatedCognitiveLoads.join(', ')}`);
  }

  // Validate intendedOutcome (required, string, no TODO markers)
  if (!analytics.intendedOutcome || typeof analytics.intendedOutcome !== 'string') {
    addError(contextFile, `Item ${itemIdx} pack entry analytics.intendedOutcome missing or invalid (must be string, required)`);
  } else if (analytics.intendedOutcome.length === 0) {
    addError(contextFile, `Item ${itemIdx} pack entry analytics.intendedOutcome must not be empty`);
  } else if (analytics.intendedOutcome.toUpperCase().includes('TODO') ||
    analytics.intendedOutcome.toUpperCase().includes('FIXME') ||
    analytics.intendedOutcome.toUpperCase().includes('TBD')) {
    addError(contextFile, `Item ${itemIdx} pack entry analytics.intendedOutcome contains TODO/FIXME/TBD placeholder (must be human-written)`);
  }

  // Validate focus (required, string)
  if (!analytics.focus || typeof analytics.focus !== 'string') {
    addError(contextFile, `Item ${itemIdx} pack entry analytics.focus missing or invalid (must be string, required)`);
  } else if (analytics.focus.length === 0) {
    addError(contextFile, `Item ${itemIdx} pack entry analytics.focus must not be empty`);
  }

  // Validate cognitiveLoad (required, enum) - must match estimatedCognitiveLoad
  const validCognitiveLoads = ['low', 'medium', 'high'];
  if (!analytics.cognitiveLoad || typeof analytics.cognitiveLoad !== 'string') {
    addError(contextFile, `Item ${itemIdx} pack entry analytics.cognitiveLoad missing or invalid (must be one of: ${validCognitiveLoads.join(', ')}, required)`);
  } else if (!validCognitiveLoads.includes(analytics.cognitiveLoad)) {
    addError(contextFile, `Item ${itemIdx} pack entry analytics.cognitiveLoad "${analytics.cognitiveLoad}" is invalid. Must be one of: ${validCognitiveLoads.join(', ')}`);
  } else if (analytics.estimatedCognitiveLoad && analytics.cognitiveLoad !== analytics.estimatedCognitiveLoad) {
    addError(contextFile, `Item ${itemIdx} pack entry analytics.cognitiveLoad "${analytics.cognitiveLoad}" does not match analytics.estimatedCognitiveLoad "${analytics.estimatedCognitiveLoad}"`);
  }

  // Validate responseSpeedTargetMs (required, number, 500-3000ms)
  if (typeof analytics.responseSpeedTargetMs !== 'number') {
    addError(contextFile, `Item ${itemIdx} pack entry analytics.responseSpeedTargetMs missing or invalid (must be number, required)`);
  } else if (analytics.responseSpeedTargetMs < 500 || analytics.responseSpeedTargetMs > 3000) {
    addError(contextFile, `Item ${itemIdx} pack entry analytics.responseSpeedTargetMs (${analytics.responseSpeedTargetMs}) must be between 500 and 3000 milliseconds`);
  }

  // Validate fluencyOutcome (required, string)
  if (!analytics.fluencyOutcome || typeof analytics.fluencyOutcome !== 'string') {
    addError(contextFile, `Item ${itemIdx} pack entry analytics.fluencyOutcome missing or invalid (must be string, required)`);
  } else if (analytics.fluencyOutcome.length === 0) {
    addError(contextFile, `Item ${itemIdx} pack entry analytics.fluencyOutcome must not be empty`);
  }

  // Validate whyThisWorks (required, array of strings, min 2, max 5, each <= 120 chars)
  if (!Array.isArray(analytics.whyThisWorks)) {
    addError(contextFile, `Item ${itemIdx} pack entry analytics.whyThisWorks missing or invalid (must be array, required)`);
  } else if (analytics.whyThisWorks.length < 2) {
    addError(contextFile, `Item ${itemIdx} pack entry analytics.whyThisWorks length is invalid (${analytics.whyThisWorks.length} items). Must have at least 2 items.`);
  } else if (analytics.whyThisWorks.length > 5) {
    addError(contextFile, `Item ${itemIdx} pack entry analytics.whyThisWorks length is invalid (${analytics.whyThisWorks.length} items). Must have at most 5 items.`);
  } else {
    analytics.whyThisWorks.forEach((bullet: any, idx: number) => {
      if (typeof bullet !== 'string') {
        addError(contextFile, `Item ${itemIdx} pack entry analytics.whyThisWorks[${idx}] must be a string`);
      } else if (bullet.length === 0) {
        addError(contextFile, `Item ${itemIdx} pack entry analytics.whyThisWorks[${idx}] must not be empty`);
      } else if (bullet.length > 120) {
        addError(contextFile, `Item ${itemIdx} pack entry analytics.whyThisWorks[${idx}] length is invalid (${bullet.length} chars). Must be <= 120 chars.`);
      }
    });
  }

  // ============================================
  // LEGACY ANALYTICS (OPTIONAL, for backward compatibility)
  // ============================================

  // Validate version
  if (analytics.version !== undefined && analytics.version !== 1) {
    addError(contextFile, `Item ${itemIdx} pack entry analytics.version must be 1 (got ${analytics.version})`);
  }

  // Validate that analytics fields match pack top-level fields (single source of truth)
  if (analytics.primaryStructure !== undefined && entry.primaryStructure !== undefined) {
    if (analytics.primaryStructure !== entry.primaryStructure) {
      addError(contextFile, `Item ${itemIdx} pack entry analytics.primaryStructure "${analytics.primaryStructure}" does not match pack.primaryStructure "${entry.primaryStructure}"`);
    }
  }

  if (analytics.scenario !== undefined && entry.scenario !== undefined) {
    if (analytics.scenario !== entry.scenario) {
      addError(contextFile, `Item ${itemIdx} pack entry analytics.scenario "${analytics.scenario}" does not match pack.scenario "${entry.scenario}"`);
    }
  }

  if (analytics.register !== undefined && entry.register !== undefined) {
    // Normalize "informal" to "casual" for comparison
    const normalizedAnalyticsRegister = analytics.register === 'informal' ? 'casual' : analytics.register;
    const normalizedPackRegister = entry.register === 'informal' ? 'casual' : entry.register;
    if (normalizedAnalyticsRegister !== normalizedPackRegister) {
      addError(contextFile, `Item ${itemIdx} pack entry analytics.register "${analytics.register}" does not match pack.register "${entry.register}"`);
    }
  }

  if (analytics.variationSlots !== undefined && entry.variationSlots !== undefined) {
    const analyticsSlots = [...(analytics.variationSlots || [])].sort();
    const packSlots = [...(entry.variationSlots || [])].sort();
    if (JSON.stringify(analyticsSlots) !== JSON.stringify(packSlots)) {
      addError(contextFile, `Item ${itemIdx} pack entry analytics.variationSlots does not match pack.variationSlots`);
    }
  }

  // Validate goal
  if (!analytics.goal || typeof analytics.goal !== 'string') {
    addError(contextFile, `Item ${itemIdx} pack entry analytics.goal missing or invalid (must be string, 1-120 chars)`);
  } else if (analytics.goal.length === 0 || analytics.goal.length > 120) {
    addError(contextFile, `Item ${itemIdx} pack entry analytics.goal length is invalid (${analytics.goal.length} chars). Must be 1-120 chars.`);
  } else if (analytics.goal.includes('TODO') || analytics.goal.includes('FIXME')) {
    // Warning only - not a hard fail, but review harness should catch this
    console.warn(`⚠️  Item ${itemIdx} pack entry analytics.goal contains TODO/FIXME placeholder`);
  }

  // Validate constraints array
  if (!Array.isArray(analytics.constraints)) {
    addError(contextFile, `Item ${itemIdx} pack entry analytics.constraints must be an array`);
  } else if (analytics.constraints.length === 0 || analytics.constraints.length > 6) {
    addError(contextFile, `Item ${itemIdx} pack entry analytics.constraints length is invalid (${analytics.constraints.length} items). Must be 1-6 items.`);
  } else {
    analytics.constraints.forEach((constraint: any, idx: number) => {
      if (typeof constraint !== 'string') {
        addError(contextFile, `Item ${itemIdx} pack entry analytics.constraints[${idx}] must be a string`);
      } else if (constraint.length === 0 || constraint.length > 80) {
        addError(contextFile, `Item ${itemIdx} pack entry analytics.constraints[${idx}] length is invalid (${constraint.length} chars). Must be 1-80 chars.`);
      }
    });
  }

  // Validate levers array
  if (!Array.isArray(analytics.levers)) {
    addError(contextFile, `Item ${itemIdx} pack entry analytics.levers must be an array`);
  } else if (analytics.levers.length === 0 || analytics.levers.length > 6) {
    addError(contextFile, `Item ${itemIdx} pack entry analytics.levers length is invalid (${analytics.levers.length} items). Must be 1-6 items.`);
  } else {
    const variationSlots = entry.variationSlots || [];
    const validLeverKeywords = ['subject', 'verb', 'object', 'modifier', 'tense', 'polarity', 'time', 'location', 'register', 'scenario', 'intent'];

    analytics.levers.forEach((lever: any, idx: number) => {
      if (typeof lever !== 'string') {
        addError(contextFile, `Item ${itemIdx} pack entry analytics.levers[${idx}] must be a string`);
      } else if (lever.length === 0 || lever.length > 80) {
        addError(contextFile, `Item ${itemIdx} pack entry analytics.levers[${idx}] length is invalid (${lever.length} chars). Must be 1-80 chars.`);
      } else {
        // Alignment check: lever must reference a variationSlot or be a valid lever keyword
        const leverLower = lever.toLowerCase();
        const isVariationSlot = variationSlots.some((slot: string) => leverLower.includes(slot.toLowerCase()));
        const isLeverKeyword = validLeverKeywords.some((keyword: string) => leverLower.includes(keyword.toLowerCase()));

        if (!isVariationSlot && !isLeverKeyword) {
          addError(contextFile, `Item ${itemIdx} pack entry analytics.levers[${idx}] "${lever}" must reference a variationSlot (${variationSlots.join(', ')}) or a valid lever keyword`);
        }
      }
    });
  }

  // Validate successCriteria array
  if (!Array.isArray(analytics.successCriteria)) {
    addError(contextFile, `Item ${itemIdx} pack entry analytics.successCriteria must be an array`);
  } else if (analytics.successCriteria.length === 0 || analytics.successCriteria.length > 6) {
    addError(contextFile, `Item ${itemIdx} pack entry analytics.successCriteria length is invalid (${analytics.successCriteria.length} items). Must be 1-6 items.`);
  } else {
    analytics.successCriteria.forEach((criterion: any, idx: number) => {
      if (typeof criterion !== 'string') {
        addError(contextFile, `Item ${itemIdx} pack entry analytics.successCriteria[${idx}] must be a string`);
      } else if (criterion.length === 0 || criterion.length > 80) {
        addError(contextFile, `Item ${itemIdx} pack entry analytics.successCriteria[${idx}] length is invalid (${criterion.length} chars). Must be 1-80 chars.`);
      }
    });
  }

  // Validate commonMistakes array
  if (!Array.isArray(analytics.commonMistakes)) {
    addError(contextFile, `Item ${itemIdx} pack entry analytics.commonMistakes must be an array`);
  } else if (analytics.commonMistakes.length === 0 || analytics.commonMistakes.length > 6) {
    addError(contextFile, `Item ${itemIdx} pack entry analytics.commonMistakes length is invalid (${analytics.commonMistakes.length} items). Must be 1-6 items.`);
  } else {
    analytics.commonMistakes.forEach((mistake: any, idx: number) => {
      if (typeof mistake !== 'string') {
        addError(contextFile, `Item ${itemIdx} pack entry analytics.commonMistakes[${idx}] must be a string`);
      } else if (mistake.length === 0 || mistake.length > 80) {
        addError(contextFile, `Item ${itemIdx} pack entry analytics.commonMistakes[${idx}] length is invalid (${mistake.length} chars). Must be 1-80 chars.`);
      }
    });
  }

  // Validate drillType enum
  const validDrillTypes = ['substitution', 'pattern-switch', 'roleplay-bounded'];
  if (!analytics.drillType || typeof analytics.drillType !== 'string') {
    addError(contextFile, `Item ${itemIdx} pack entry analytics.drillType missing or invalid (must be one of: ${validDrillTypes.join(', ')})`);
  } else if (!validDrillTypes.includes(analytics.drillType)) {
    addError(contextFile, `Item ${itemIdx} pack entry analytics.drillType "${analytics.drillType}" is invalid. Must be one of: ${validDrillTypes.join(', ')}`);
  }

  // Validate cognitiveLoad enum (legacy field)
  const validLegacyCognitiveLoads = ['low', 'medium', 'high'];
  if (!analytics.cognitiveLoad || typeof analytics.cognitiveLoad !== 'string') {
    // Legacy field, optional
  } else if (!validLegacyCognitiveLoads.includes(analytics.cognitiveLoad)) {
    addError(contextFile, `Item ${itemIdx} pack entry analytics.cognitiveLoad "${analytics.cognitiveLoad}" is invalid. Must be one of: ${validLegacyCognitiveLoads.join(', ')}`);
  }

  // Telemetry readiness fields (required for telemetry contract)
  // Validate targetLatencyMs
  if (typeof analytics.targetLatencyMs !== 'number') {
    addError(contextFile, `Item ${itemIdx} pack entry analytics.targetLatencyMs missing or invalid (must be number, 200-5000)`);
  } else if (analytics.targetLatencyMs < 200 || analytics.targetLatencyMs > 5000) {
    addError(contextFile, `Item ${itemIdx} pack entry analytics.targetLatencyMs is ${analytics.targetLatencyMs}. Must be between 200 and 5000 milliseconds.`);
  }

  // Validate successDefinition
  if (!analytics.successDefinition || typeof analytics.successDefinition !== 'string') {
    addError(contextFile, `Item ${itemIdx} pack entry analytics.successDefinition missing or invalid (must be string, <= 140 chars)`);
  } else if (analytics.successDefinition.length === 0 || analytics.successDefinition.length > 140) {
    addError(contextFile, `Item ${itemIdx} pack entry analytics.successDefinition length is invalid (${analytics.successDefinition.length} chars). Must be 1-140 chars.`);
  }

  // Validate keyFailureModes array
  if (!Array.isArray(analytics.keyFailureModes)) {
    addError(contextFile, `Item ${itemIdx} pack entry analytics.keyFailureModes must be an array`);
  } else if (analytics.keyFailureModes.length === 0 || analytics.keyFailureModes.length > 6) {
    addError(contextFile, `Item ${itemIdx} pack entry analytics.keyFailureModes length is invalid (${analytics.keyFailureModes.length} items). Must be 1-6 items.`);
  } else {
    analytics.keyFailureModes.forEach((mode: any, idx: number) => {
      if (typeof mode !== 'string') {
        addError(contextFile, `Item ${itemIdx} pack entry analytics.keyFailureModes[${idx}] must be a string`);
      } else if (mode.length === 0 || mode.length > 40) {
        addError(contextFile, `Item ${itemIdx} pack entry analytics.keyFailureModes[${idx}] length is invalid (${mode.length} chars). Must be 1-40 chars.`);
      }
    });
  }

  // Optional telemetry fields (mirrors of pack-level fields)
  if (analytics.primaryStructure !== undefined && typeof analytics.primaryStructure !== 'string') {
    addError(contextFile, `Item ${itemIdx} pack entry analytics.primaryStructure must be a string if present`);
  }
  if (analytics.variationSlots !== undefined && !Array.isArray(analytics.variationSlots)) {
    addError(contextFile, `Item ${itemIdx} pack entry analytics.variationSlots must be an array if present`);
  }

  // Alignment checks
  // If drillType is not 'substitution', scenario/register/primaryStructure must exist
  if (analytics.drillType && analytics.drillType !== 'substitution') {
    if (!entry.scenario || typeof entry.scenario !== 'string') {
      addError(contextFile, `Item ${itemIdx} pack entry analytics.drillType is "${analytics.drillType}" but scenario is missing. Non-substitution drills require scenario.`);
    }
    if (!entry.register || typeof entry.register !== 'string') {
      addError(contextFile, `Item ${itemIdx} pack entry analytics.drillType is "${analytics.drillType}" but register is missing. Non-substitution drills require register.`);
    }
    if (!entry.primaryStructure || typeof entry.primaryStructure !== 'string') {
      addError(contextFile, `Item ${itemIdx} pack entry analytics.drillType is "${analytics.drillType}" but primaryStructure is missing. Non-substitution drills require primaryStructure.`);
    }
  }

  // Warnings (non-fatal)
  // Check if successCriteria overlaps heavily with commonMistakes
  if (Array.isArray(analytics.successCriteria) && Array.isArray(analytics.commonMistakes)) {
    const overlap = analytics.successCriteria.filter((sc: string) =>
      analytics.commonMistakes.some((cm: string) => sc.toLowerCase() === cm.toLowerCase())
    );
    if (overlap.length > 0) {
      console.warn(`⚠️  Item ${itemIdx} pack entry analytics: successCriteria overlaps with commonMistakes: ${overlap.join(', ')}`);
    }
  }

  // Check if cognitiveLoad is 'low' while multi-slot variation requirement is high
  if (analytics.cognitiveLoad === 'low' && Array.isArray(entry.variationSlots) && entry.variationSlots.length >= 4) {
    console.warn(`⚠️  Item ${itemIdx} pack entry analytics: cognitiveLoad is 'low' but variationSlots has ${entry.variationSlots.length} items (>=4). Consider medium/high cognitive load.`);
  }

  // Validate new analytics fields (v1 extended)
  if (typeof analytics.minDistinctSubjects === 'number') {
    if (analytics.minDistinctSubjects < 3) {
      addError(contextFile, `Item ${itemIdx} pack entry analytics.minDistinctSubjects (${analytics.minDistinctSubjects}) must be >= 3`);
    }
  }

  if (typeof analytics.minDistinctVerbs === 'number') {
    if (analytics.minDistinctVerbs < 3) {
      addError(contextFile, `Item ${itemIdx} pack entry analytics.minDistinctVerbs (${analytics.minDistinctVerbs}) must be >= 3`);
    }
  }

  if (typeof analytics.minMultiSlotRate === 'number') {
    if (analytics.minMultiSlotRate < 0 || analytics.minMultiSlotRate > 1) {
      addError(contextFile, `Item ${itemIdx} pack entry analytics.minMultiSlotRate (${analytics.minMultiSlotRate}) must be between 0.0 and 1.0`);
    }
  }

  if (typeof analytics.targetResponseSeconds === 'number') {
    if (analytics.targetResponseSeconds < 0.5 || analytics.targetResponseSeconds > 6.0) {
      addError(contextFile, `Item ${itemIdx} pack entry analytics.targetResponseSeconds (${analytics.targetResponseSeconds}) must be between 0.5 and 6.0`);
    }
  }

  if (Array.isArray(analytics.canonicalIntents)) {
    if (analytics.canonicalIntents.length < 3) {
      addError(contextFile, `Item ${itemIdx} pack entry analytics.canonicalIntents must have at least 3 items, got ${analytics.canonicalIntents.length}`);
    }
    const validIntents = ['greet', 'request', 'apologize', 'inform', 'ask', 'confirm', 'schedule', 'order', 'ask_price', 'thank', 'goodbye', 'decline'];
    for (const intent of analytics.canonicalIntents) {
      if (!validIntents.includes(intent)) {
        addError(contextFile, `Item ${itemIdx} pack entry analytics.canonicalIntents contains invalid intent "${intent}". Must be one of: ${validIntents.join(', ')}`);
      }
    }
  }

  if (Array.isArray(analytics.anchorPhrases)) {
    if (analytics.anchorPhrases.length < 3) {
      addError(contextFile, `Item ${itemIdx} pack entry analytics.anchorPhrases must have at least 3 items, got ${analytics.anchorPhrases.length}`);
    }
  }

  // Computed validations (if prompts exist)
  if (entry.prompts && Array.isArray(entry.prompts) && entry.prompts.length > 0) {
    const prompts = entry.prompts.filter((p: any) => p && p.text && typeof p.text === 'string');

    // Compute distinct subjects
    if (typeof analytics.minDistinctSubjects === 'number') {
      const distinctSubjects = computeDistinctSubjects(prompts);
      if (distinctSubjects < analytics.minDistinctSubjects) {
        addError(contextFile, `Item ${itemIdx} pack entry analytics: measured distinct subjects (${distinctSubjects}) < minDistinctSubjects (${analytics.minDistinctSubjects})`);
      }
    }

    // Compute distinct verbs
    if (typeof analytics.minDistinctVerbs === 'number') {
      const distinctVerbs = computeDistinctVerbs(prompts);
      if (distinctVerbs < analytics.minDistinctVerbs) {
        addError(contextFile, `Item ${itemIdx} pack entry analytics: measured distinct verbs (${distinctVerbs}) < minDistinctVerbs (${analytics.minDistinctVerbs})`);
      }
    }

    // Compute multi-slot rate
    if (typeof analytics.minMultiSlotRate === 'number') {
      const measuredRate = computeMultiSlotRate(prompts);
      if (measuredRate < analytics.minMultiSlotRate) {
        addError(contextFile, `Item ${itemIdx} pack entry analytics: measured multi-slot rate (${measuredRate.toFixed(2)}) < minMultiSlotRate (${analytics.minMultiSlotRate})`);
      }
    }

    // Validate canonical intents appear in prompts
    if (Array.isArray(analytics.canonicalIntents) && analytics.canonicalIntents.length > 0) {
      const promptIntents = new Set(prompts.map((p: any) => p.intent).filter(Boolean));
      for (const intent of analytics.canonicalIntents) {
        if (!promptIntents.has(intent)) {
          addError(contextFile, `Item ${itemIdx} pack entry analytics: canonicalIntent "${intent}" not found in any prompt`);
        }
      }
    }

    // Validate anchor phrases appear in prompts
    if (Array.isArray(analytics.anchorPhrases) && analytics.anchorPhrases.length > 0) {
      const allPromptText = prompts.map((p: any) => p.text.toLowerCase()).join(' ');
      for (const phrase of analytics.anchorPhrases) {
        const phraseLower = phrase.toLowerCase();
        if (!allPromptText.includes(phraseLower)) {
          addError(contextFile, `Item ${itemIdx} pack entry analytics: anchorPhrase "${phrase}" not found in any prompt`);
        }
      }
    }
  }

  // Validate whyThisWorks array
  if (!Array.isArray(analytics.whyThisWorks)) {
    addError(contextFile, `Item ${itemIdx} pack entry analytics.whyThisWorks must be an array`);
  } else if (analytics.whyThisWorks.length === 0 || analytics.whyThisWorks.length > 5) {
    addError(contextFile, `Item ${itemIdx} pack entry analytics.whyThisWorks length is invalid (${analytics.whyThisWorks.length} items). Must be 1-5 items.`);
  } else {
    const genericPhrases = ['practice more', 'learn faster', 'improve skills', 'get better', 'study hard'];
    analytics.whyThisWorks.forEach((bullet: any, idx: number) => {
      if (typeof bullet !== 'string') {
        addError(contextFile, `Item ${itemIdx} pack entry analytics.whyThisWorks[${idx}] must be a string`);
      } else if (bullet.length === 0 || bullet.length > 120) {
        addError(contextFile, `Item ${itemIdx} pack entry analytics.whyThisWorks[${idx}] length is invalid (${bullet.length} chars). Must be 1-120 chars.`);
      } else {
        // Check for generic phrases (warning only)
        const bulletLower = bullet.toLowerCase();
        for (const phrase of genericPhrases) {
          if (bulletLower.includes(phrase)) {
            console.warn(`⚠️  Item ${itemIdx} pack entry analytics.whyThisWorks[${idx}] contains generic phrase: "${phrase}"`);
            break;
          }
        }
        // Check for TODO/FIXME
        if (bulletLower.includes('todo') || bulletLower.includes('fixme') || bulletLower.includes('tbd')) {
          console.warn(`⚠️  Item ${itemIdx} pack entry analytics.whyThisWorks[${idx}] contains TODO/FIXME/TBD placeholder`);
        }
      }
    });
  }

  // Validate exitConditions object
  if (!analytics.exitConditions || typeof analytics.exitConditions !== 'object') {
    addError(contextFile, `Item ${itemIdx} pack entry analytics.exitConditions missing or invalid (must be object)`);
  } else {
    // Validate targetMinutes
    if (typeof analytics.exitConditions.targetMinutes !== 'number') {
      addError(contextFile, `Item ${itemIdx} pack entry analytics.exitConditions.targetMinutes missing or invalid (must be number)`);
    } else if (analytics.exitConditions.targetMinutes < 1 || analytics.exitConditions.targetMinutes > 20) {
      addError(contextFile, `Item ${itemIdx} pack entry analytics.exitConditions.targetMinutes (${analytics.exitConditions.targetMinutes}) is outside valid range [1-20]`);
    }

    // Validate completeWhen enum
    const validCompleteWhen = ['sessionPlan_completed_once', 'sessionPlan_completed_twice', 'manual_mark_complete'];
    if (!analytics.exitConditions.completeWhen || typeof analytics.exitConditions.completeWhen !== 'string') {
      addError(contextFile, `Item ${itemIdx} pack entry analytics.exitConditions.completeWhen missing or invalid (must be one of: ${validCompleteWhen.join(', ')})`);
    } else if (!validCompleteWhen.includes(analytics.exitConditions.completeWhen)) {
      addError(contextFile, `Item ${itemIdx} pack entry analytics.exitConditions.completeWhen "${analytics.exitConditions.completeWhen}" is invalid. Must be one of: ${validCompleteWhen.join(', ')}`);
    }
  }
}

/**
 * Validate catalog-level analytics for drill entries
 */
function validateDrillAnalytics(analytics: any, entry: any, contextFile: string, itemIdx: number): void {
  // For v4 drills, use different validation
  if (entry.drillVersion === 'v4') {
    // v4 analytics validation is handled in the v4-specific validation section
    // Just check that analytics exists and has required v4 fields
    if (!analytics.mechanicId || typeof analytics.mechanicId !== 'string') {
      addError(contextFile, `Item ${itemIdx} drill v4 entry analytics.mechanicId missing or invalid`);
    }
    if (!analytics.loopType || typeof analytics.loopType !== 'string') {
      addError(contextFile, `Item ${itemIdx} drill v4 entry analytics.loopType missing or invalid`);
    }
    if (!Array.isArray(analytics.targetStructures)) {
      addError(contextFile, `Item ${itemIdx} drill v4 entry analytics.targetStructures must be an array`);
    }
    return; // Skip old analytics validation for v4
  }

  // Legacy drill analytics validation
  // Validate primaryStructure (required)
  if (!analytics.primaryStructure || typeof analytics.primaryStructure !== 'string') {
    addError(contextFile, `Item ${itemIdx} drill entry analytics.primaryStructure missing or invalid (must be string, required)`);
  }

  // Validate variationSlots (required, array)
  if (!Array.isArray(analytics.variationSlots)) {
    addError(contextFile, `Item ${itemIdx} drill entry analytics.variationSlots missing or invalid (must be array, required)`);
  }

  // Validate slotSwitchDensity (required, 0-1)
  if (typeof analytics.slotSwitchDensity !== 'number') {
    addError(contextFile, `Item ${itemIdx} drill entry analytics.slotSwitchDensity missing or invalid (must be number 0-1, required)`);
  } else if (analytics.slotSwitchDensity < 0 || analytics.slotSwitchDensity > 1) {
    addError(contextFile, `Item ${itemIdx} drill entry analytics.slotSwitchDensity (${analytics.slotSwitchDensity}) must be between 0.0 and 1.0`);
  }

  // Validate promptDiversityScore (required, 0-1)
  if (typeof analytics.promptDiversityScore !== 'number') {
    addError(contextFile, `Item ${itemIdx} drill entry analytics.promptDiversityScore missing or invalid (must be number 0-1, required)`);
  } else if (analytics.promptDiversityScore < 0 || analytics.promptDiversityScore > 1) {
    addError(contextFile, `Item ${itemIdx} drill entry analytics.promptDiversityScore (${analytics.promptDiversityScore}) must be between 0.0 and 1.0`);
  }

  // Validate scenarioCoverageScore (required, 0-1)
  if (typeof analytics.scenarioCoverageScore !== 'number') {
    addError(contextFile, `Item ${itemIdx} drill entry analytics.scenarioCoverageScore missing or invalid (must be number 0-1, required)`);
  } else if (analytics.scenarioCoverageScore < 0 || analytics.scenarioCoverageScore > 1) {
    addError(contextFile, `Item ${itemIdx} drill entry analytics.scenarioCoverageScore (${analytics.scenarioCoverageScore}) must be between 0.0 and 1.0`);
  }

  // Validate estimatedCognitiveLoad (required, enum)
  const validCognitiveLoads = ['low', 'medium', 'high'];
  if (!analytics.estimatedCognitiveLoad || typeof analytics.estimatedCognitiveLoad !== 'string') {
    addError(contextFile, `Item ${itemIdx} drill entry analytics.estimatedCognitiveLoad missing or invalid (must be one of: ${validCognitiveLoads.join(', ')}, required)`);
  } else if (!validCognitiveLoads.includes(analytics.estimatedCognitiveLoad)) {
    addError(contextFile, `Item ${itemIdx} drill entry analytics.estimatedCognitiveLoad "${analytics.estimatedCognitiveLoad}" is invalid. Must be one of: ${validCognitiveLoads.join(', ')}`);
  }

  // Validate intendedOutcome (required, string, no TODO markers)
  if (!analytics.intendedOutcome || typeof analytics.intendedOutcome !== 'string') {
    addError(contextFile, `Item ${itemIdx} drill entry analytics.intendedOutcome missing or invalid (must be string, required)`);
  } else if (analytics.intendedOutcome.length === 0) {
    addError(contextFile, `Item ${itemIdx} drill entry analytics.intendedOutcome must not be empty`);
  } else if (analytics.intendedOutcome.toUpperCase().includes('TODO') ||
    analytics.intendedOutcome.toUpperCase().includes('FIXME') ||
    analytics.intendedOutcome.toUpperCase().includes('TBD')) {
    addError(contextFile, `Item ${itemIdx} drill entry analytics.intendedOutcome contains TODO/FIXME/TBD placeholder (must be human-written)`);
  }
}

/**
 * Compute distinct subjects from prompts
 */
function computeDistinctSubjects(prompts: any[]): number {
  const subjects = new Set<string>();

  for (const prompt of prompts) {
    // Try explicit subject tag first
    if (prompt.subjectTag && typeof prompt.subjectTag === 'string') {
      subjects.add(prompt.subjectTag.toLowerCase());
      continue;
    }

    // Try slots.subject
    if (prompt.slots && prompt.slots.subject && Array.isArray(prompt.slots.subject)) {
      prompt.slots.subject.forEach((s: string) => {
        if (s) subjects.add(s.toLowerCase());
      });
      continue;
    }

    // Heuristic: first token if it's a pronoun
    if (prompt.text) {
      const tokens = prompt.text.trim().split(/\s+/);
      if (tokens.length > 0) {
        const firstToken = tokens[0].replace(/[.,!?;:]$/, '').toLowerCase();
        const PRONOUNS = ['ich', 'du', 'er', 'sie', 'es', 'wir', 'ihr', 'sie', 'i', 'you', 'he', 'she', 'it', 'we', 'they'];
        if (PRONOUNS.includes(firstToken)) {
          subjects.add(firstToken);
        }
      }
    }
  }

  return subjects.size;
}

/**
 * Compute distinct verbs from prompts
 */
function computeDistinctVerbs(prompts: any[]): number {
  const verbs = new Set<string>();

  for (const prompt of prompts) {
    // Try explicit verb tag first
    if (prompt.verbTag && typeof prompt.verbTag === 'string') {
      verbs.add(prompt.verbTag.toLowerCase());
      continue;
    }

    // Try slots.verb
    if (prompt.slots && prompt.slots.verb && Array.isArray(prompt.slots.verb)) {
      prompt.slots.verb.forEach((v: string) => {
        if (v) verbs.add(v.toLowerCase());
      });
      continue;
    }

    // Heuristic: second token if first is pronoun, or look for common verb patterns
    if (prompt.text) {
      const tokens = prompt.text.trim().split(/\s+/);
      if (tokens.length > 1) {
        const firstToken = tokens[0].replace(/[.,!?;:]$/, '').toLowerCase();
        const PRONOUNS = ['ich', 'du', 'er', 'sie', 'es', 'wir', 'ihr', 'sie', 'i', 'you', 'he', 'she', 'it', 'we', 'they'];
        if (PRONOUNS.includes(firstToken)) {
          const secondToken = tokens[1].replace(/[.,!?;:]$/, '').toLowerCase();
          if (secondToken && secondToken.length > 2) {
            verbs.add(secondToken);
          }
        }
      }
    }
  }

  return verbs.size;
}

/**
 * Compute multi-slot rate (fraction of prompts with multiple slots changed)
 */
function computeMultiSlotRate(prompts: any[]): number {
  if (prompts.length === 0) return 0;

  let multiSlotCount = 0;

  for (const prompt of prompts) {
    if (prompt.slotsChanged && Array.isArray(prompt.slotsChanged)) {
      if (prompt.slotsChanged.length >= 2) {
        multiSlotCount++;
      }
    } else if (prompt.slots && typeof prompt.slots === 'object') {
      const slotKeys = Object.keys(prompt.slots).filter(key => {
        const slotValues = prompt.slots[key];
        return Array.isArray(slotValues) && slotValues.length > 0;
      });
      if (slotKeys.length >= 2) {
        multiSlotCount++;
      }
    }
  }

  return multiSlotCount / prompts.length;
}

function validatePackQualityGates(entry: any, contextFile: string, itemIdx: number): void {
  if (!entry.prompts || !Array.isArray(entry.prompts) || entry.prompts.length === 0) {
    return; // No prompts to validate
  }

  const prompts = entry.prompts.filter((p: any) => p && p.text && typeof p.text === 'string');

  if (prompts.length === 0) {
    return; // No valid prompts
  }

  // Rule 1: Generic Template Denylist
  for (const prompt of prompts) {
    const textLower = prompt.text.toLowerCase();
    for (const phrase of DENYLIST_PHRASES) {
      if (textLower.includes(phrase.toLowerCase())) {
        addError(contextFile, `Item ${itemIdx} pack entry Quality Gate violation: prompt "${prompt.id || 'unknown'}" contains denylisted phrase "${phrase}"`);
        return; // Fail fast on first violation
      }
    }
  }

  // Rule 2: Multi-slot Variation
  // Extract verbs and subjects from prompts
  const verbs = new Set<string>();
  const subjects = new Set<string>();

  for (const prompt of prompts) {
    const text = prompt.text.trim();
    const tokens = text.split(/\s+/);

    // Subject detection: look for pronouns anywhere in the sentence
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i].replace(/[.,!?;:]$/, '').toLowerCase();
      if (ALL_PRONOUNS.includes(token)) {
        subjects.add(token);
      }
    }

    // Verb detection: 
    // 1. If sentence starts with pronoun, second token is likely the verb
    // 2. Look for pronoun + verb pattern anywhere in sentence
    // 3. Look for common verb patterns (German + English)
    if (tokens.length > 0) {
      const firstToken = tokens[0].replace(/[.,!?;:]$/, '').toLowerCase();

      if (ALL_PRONOUNS.includes(firstToken) && tokens.length > 1) {
        // Case 1: Starts with pronoun - second token is verb
        const secondToken = tokens[1].replace(/[.,!?;:]$/, '').toLowerCase();
        if (secondToken) {
          verbs.add(secondToken);
        }
      }

      // Case 2: Look for pronoun + verb pattern anywhere
      for (let i = 0; i < tokens.length - 1; i++) {
        const token = tokens[i].replace(/[.,!?;:]$/, '').toLowerCase();
        if (ALL_PRONOUNS.includes(token)) {
          const nextToken = tokens[i + 1].replace(/[.,!?;:]$/, '').toLowerCase();
          if (nextToken && nextToken.length > 2) {
            verbs.add(nextToken);
          }
        }
      }

      // Case 3: Look for common verb patterns anywhere in sentence (German + English)
      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i].replace(/[.,!?;:]$/, '').toLowerCase();
        // Common German verb patterns
        if (token.match(/^(geht|ist|hat|kann|können|muss|soll|will|macht|sagt|kommt|sieht|weiß|gibt|nimmt|hätte|könnte|wäre|war|waren|haben|sein|werden|sehen|geben|nehmen|helfen|vereinbaren|bringen)$/)) {
          verbs.add(token);
        }
        // Common English verb patterns
        if (token.match(/^(is|are|was|were|have|has|had|do|does|did|will|would|can|could|should|must|go|goes|went|come|comes|came|see|sees|saw|say|says|said|get|gets|got|make|makes|made|take|takes|took|give|gives|gave|know|knows|knew|think|thinks|thought|welcome|welcomes|learning|learn)$/)) {
          verbs.add(token);
        }
      }
    }
  }

  if (verbs.size < 2) {
    addError(contextFile, `Item ${itemIdx} pack entry Quality Gate violation: insufficient verb variation (found ${verbs.size} distinct verb(s), required: 2)`);
  }

  if (subjects.size < 2) {
    addError(contextFile, `Item ${itemIdx} pack entry Quality Gate violation: insufficient subject variation (found ${subjects.size} distinct subject(s), required: 2)`);
  }

  // Rule 3: Register Consistency
  if (entry.register === 'formal') {
    let hasFormalMarker = false;
    for (const prompt of prompts) {
      const text = prompt.text;
      // Check for "Sie" (case-sensitive) or "Ihnen" (case-sensitive)
      if (/\bSie\b/.test(text) || /\bIhnen\b/.test(text)) {
        hasFormalMarker = true;
        break;
      }
    }
    if (!hasFormalMarker) {
      addError(contextFile, `Item ${itemIdx} pack entry Quality Gate violation: register is "formal" but no prompts contain "Sie" or "Ihnen"`);
    }
  }

  // Rule 4: Concreteness Marker
  let concretenessCount = 0;
  for (const prompt of prompts) {
    const text = prompt.text;
    let hasMarker = false;

    // Check for digit
    if (/\d/.test(text)) {
      hasMarker = true;
    }
    // Check for currency symbol
    else if (/[€$]/.test(text)) {
      hasMarker = true;
    }
    // Check for time marker (colon with digits)
    else if (/\d{1,2}:\d{2}/.test(text)) {
      hasMarker = true;
    }
    // Check for weekday
    else {
      const textLower = text.toLowerCase();
      for (const weekday of WEEKDAY_TOKENS) {
        if (textLower.includes(weekday)) {
          hasMarker = true;
          break;
        }
      }
    }

    if (hasMarker) {
      concretenessCount++;
    }
  }

  if (concretenessCount < 2) {
    addError(contextFile, `Item ${itemIdx} pack entry Quality Gate violation: insufficient concreteness markers (found ${concretenessCount} prompt(s) with markers, required: 2)`);
  }
}

/**
 * Validate analytics block for pack entries
 */
function validatePackAnalytics(entry: any, contextFile: string, itemIdx: number): void {
  const provenance = entry.provenance || {};
  const source = provenance.source;
  const isGenerated = source === 'pdf' || source === 'template';

  // For generated content, analytics is required
  if (isGenerated) {
    if (!entry.analytics || typeof entry.analytics !== 'object') {
      addError(contextFile, `Item ${itemIdx} pack entry missing required analytics block (required for generated content with source="${source}")`);
      return;
    }

    const analytics = entry.analytics;

    // Check required analytics fields
    if (analytics.version !== 1) {
      addError(contextFile, `Item ${itemIdx} pack entry analytics.version must be 1, found: ${analytics.version}`);
    }

    if (!analytics.qualityGateVersion || typeof analytics.qualityGateVersion !== 'string') {
      addError(contextFile, `Item ${itemIdx} pack entry analytics.qualityGateVersion is required`);
    }

    if (typeof analytics.passesQualityGates !== 'boolean') {
      addError(contextFile, `Item ${itemIdx} pack entry analytics.passesQualityGates must be a boolean`);
    } else if (!analytics.passesQualityGates && entry.review?.status === 'approved') {
      // Allow approved packs to have passesQualityGates: false if they've been manually reviewed
      // This allows for edge cases where quality gates are too strict but content is still valid
      console.warn(`⚠️  Item ${itemIdx} pack entry has passesQualityGates: false but is approved. Consider reviewing quality gate failures.`);
    } else if (!analytics.passesQualityGates && entry.review?.status !== 'approved') {
      addError(contextFile, `Item ${itemIdx} pack entry analytics.passesQualityGates must be true for generated content (or pack must be approved)`);
    }

    // Recompute analytics and validate match (within tolerance for floats)
    // Skip recomputation for index entries (they don't have prompts)
    // Index entries have entryUrl but not prompts - they reference pack.json files
    if (!entry.prompts || !Array.isArray(entry.prompts) || entry.prompts.length === 0) {
      // For index entries, skip analytics recomputation (they reference pack.json, not inline prompts)
      if (entry.entryUrl) {
        return; // This is an index entry, skip recomputation
      }
      // For pack entries without prompts, still try to compute (might be using promptsUrl)
      // But if computePackAnalytics fails, that's okay - it's handled in the catch block
    }
    try {
      const computed = computePackAnalytics(entry);
      const tolerance = 0.001;

      // Validate numeric fields match (within tolerance)
      if (typeof analytics.promptCount === 'number' && Math.abs(analytics.promptCount - computed.promptCount) > tolerance) {
        addError(contextFile, `Item ${itemIdx} pack entry analytics.promptCount mismatch: expected ${computed.promptCount}, found ${analytics.promptCount}`);
      }

      if (typeof analytics.multiSlotRate === 'number' && Math.abs(analytics.multiSlotRate - computed.multiSlotRate) > tolerance) {
        addError(contextFile, `Item ${itemIdx} pack entry analytics.multiSlotRate mismatch: expected ${computed.multiSlotRate.toFixed(3)}, found ${analytics.multiSlotRate.toFixed(3)}`);
      }

      if (typeof analytics.scenarioTokenHitAvg === 'number' && Math.abs(analytics.scenarioTokenHitAvg - computed.scenarioTokenHitAvg) > tolerance) {
        addError(contextFile, `Item ${itemIdx} pack entry analytics.scenarioTokenHitAvg mismatch: expected ${computed.scenarioTokenHitAvg.toFixed(3)}, found ${analytics.scenarioTokenHitAvg.toFixed(3)}`);
      }

      if (typeof analytics.scenarioTokenQualifiedRate === 'number' && Math.abs(analytics.scenarioTokenQualifiedRate - computed.scenarioTokenQualifiedRate) > tolerance) {
        addError(contextFile, `Item ${itemIdx} pack entry analytics.scenarioTokenQualifiedRate mismatch: expected ${computed.scenarioTokenQualifiedRate.toFixed(3)}, found ${analytics.scenarioTokenQualifiedRate.toFixed(3)}`);
      }

      if (typeof analytics.uniqueTokenRate === 'number' && Math.abs(analytics.uniqueTokenRate - computed.uniqueTokenRate) > tolerance) {
        addError(contextFile, `Item ${itemIdx} pack entry analytics.uniqueTokenRate mismatch: expected ${computed.uniqueTokenRate.toFixed(3)}, found ${analytics.uniqueTokenRate.toFixed(3)}`);
      }

      if (typeof analytics.bannedPhraseViolations === 'number' && analytics.bannedPhraseViolations !== computed.bannedPhraseViolations) {
        addError(contextFile, `Item ${itemIdx} pack entry analytics.bannedPhraseViolations mismatch: expected ${computed.bannedPhraseViolations}, found ${analytics.bannedPhraseViolations}`);
      }

      if (typeof analytics.passesQualityGates === 'boolean' && analytics.passesQualityGates !== computed.passesQualityGates) {
        addError(contextFile, `Item ${itemIdx} pack entry analytics.passesQualityGates mismatch: expected ${computed.passesQualityGates}, found ${analytics.passesQualityGates}`);
      }
    } catch (error: any) {
      addError(contextFile, `Item ${itemIdx} pack entry failed to recompute analytics: ${error.message}`);
    }
  } else {
    // For handcrafted content, analytics is optional but if present, validate structure
    if (entry.analytics && typeof entry.analytics === 'object') {
      const analytics = entry.analytics;
      if (analytics.version !== undefined && analytics.version !== 1) {
        addError(contextFile, `Item ${itemIdx} pack entry analytics.version must be 1 if present, found: ${analytics.version}`);
      }
    }
  }

  // Quality Gates v2: Near-duplicate detection
  // Only run if prompts exist
  if (entry.prompts && Array.isArray(entry.prompts) && entry.prompts.length > 0) {
    const prompts = entry.prompts.filter((p: any) => p && p.text && typeof p.text === 'string');

    if (prompts.length > 1) {
      let nearDuplicateCount = 0;
      const similarityThreshold = 0.92;

      function normalizePrompt(text: string): string {
        return text
          .toLowerCase()
          .replace(/[.,!?;:]/g, '')
          .replace(/\s+/g, ' ')
          .trim();
      }

      function jaccardSimilarity(text1: string, text2: string): number {
        const tokens1 = new Set(normalizePrompt(text1).split(/\s+/));
        const tokens2 = new Set(normalizePrompt(text2).split(/\s+/));
        const intersection = new Set([...tokens1].filter(x => tokens2.has(x)));
        const union = new Set([...tokens1, ...tokens2]);
        if (union.size === 0) return 1.0;
        return intersection.size / union.size;
      }

      function normalizedEditDistance(text1: string, text2: string): number {
        const norm1 = normalizePrompt(text1);
        const norm2 = normalizePrompt(text2);
        if (norm1 === norm2) return 0;
        if (norm1.length === 0 || norm2.length === 0) return 1;

        // Simple Levenshtein approximation
        const maxLen = Math.max(norm1.length, norm2.length);
        let distance = 0;
        const minLen = Math.min(norm1.length, norm2.length);
        for (let i = 0; i < minLen; i++) {
          if (norm1[i] !== norm2[i]) distance++;
        }
        distance += Math.abs(norm1.length - norm2.length);
        return distance / maxLen;
      }

      function computeSimilarity(text1: string, text2: string): number {
        const jaccard = jaccardSimilarity(text1, text2);
        const editDist = 1 - normalizedEditDistance(text1, text2);
        return (jaccard * 0.7) + (editDist * 0.3);
      }

      for (let i = 0; i < prompts.length - 1; i++) {
        const similarity = computeSimilarity(prompts[i].text, prompts[i + 1].text);
        if (similarity >= similarityThreshold) {
          nearDuplicateCount++;
        }
      }

      const nearDuplicateRate = prompts.length > 1 ? nearDuplicateCount / (prompts.length - 1) : 0;
      if (nearDuplicateRate > 0.20) {
        addError(contextFile, `Item ${itemIdx} pack entry Quality Gate v2 violation: near-duplicate rate too high (${(nearDuplicateRate * 100).toFixed(1)}%, threshold: 20%). Pack "${entry.id}" has ${nearDuplicateCount} near-duplicate prompt pair(s).`);
      }

      // Quality Gates v2: Scenario richness
      const SCENARIO_TOKEN_DICTS: Record<string, string[]> = {
        work: ['meeting', 'shift', 'manager', 'schedule', 'invoice', 'deadline', 'office', 'colleague', 'project', 'task', 'besprechung', 'termin', 'büro', 'kollege', 'projekt', 'aufgabe', 'arbeit'],
        restaurant: ['menu', 'order', 'bill', 'reservation', 'waiter', 'table', 'food', 'drink', 'kitchen', 'service', 'speisekarte', 'bestellen', 'kellner', 'tisch', 'essen', 'trinken', 'reservierung'],
        shopping: ['price', 'buy', 'cost', 'store', 'cashier', 'payment', 'discount', 'receipt', 'cart', 'checkout', 'kaufen', 'laden', 'kasse', 'zahlung', 'rabatt', 'quittung', 'warenkorb'],
        doctor: ['appointment', 'symptom', 'prescription', 'medicine', 'treatment', 'diagnosis', 'health', 'patient', 'clinic', 'examination', 'termin', 'symptom', 'rezept', 'medizin', 'behandlung', 'diagnose', 'gesundheit', 'patient', 'klinik', 'untersuchung', 'arzt'],
        housing: ['apartment', 'rent', 'lease', 'landlord', 'tenant', 'deposit', 'utilities', 'furniture', 'neighborhood', 'address', 'wohnung', 'miete', 'mietvertrag', 'vermieter', 'mieter', 'kaution', 'nebenkosten', 'möbel', 'nachbarschaft', 'adresse'],
        government_office: ['termin', 'formular', 'anmeldung', 'bescheinigung', 'unterlagen', 'ausweis', 'amt', 'beamte', 'sachbearbeiter', 'aufenthaltserlaubnis', 'pass', 'bürgeramt', 'ausländeramt', 'jobcenter', 'krankenkasse'],
        casual_greeting: ['greeting', 'hello', 'goodbye', 'morning', 'evening', 'day', 'see', 'meet', 'friend', 'time', 'grüßen', 'hallo', 'auf wiedersehen', 'morgen', 'abend', 'tag', 'sehen', 'treffen', 'freund', 'zeit', 'tschüss'],
        friends_small_talk: ['wochenende', 'heute', 'morgen', 'spaeter', 'abends', 'zeit', 'lust', 'plan', 'idee', 'treffen', 'mitkommen', 'kino', 'cafe', 'restaurant', 'spaziergang', 'park', 'training', 'gym', 'serie', 'film', 'konzert', 'bar', 'pizza', 'kaffee', 'hast du lust', 'lass uns', 'wie waere es', 'hast du zeit', 'wollen wir', 'ich haette lust', 'kommst du mit', 'ich kann heute nicht']
      };

      const scenarioTokens = SCENARIO_TOKEN_DICTS[entry.scenario] || [];
      if (scenarioTokens.length > 0) {
        const uniqueScenarioTokens = new Set<string>();
        prompts.forEach(p => {
          const textLower = p.text.toLowerCase();
          scenarioTokens.forEach(token => {
            if (textLower.includes(token.toLowerCase())) {
              uniqueScenarioTokens.add(token);
            }
          });
        });

        // Require at least 6 unique tokens for packs with >= 8 prompts
        if (prompts.length >= 8 && uniqueScenarioTokens.size < 6) {
          addError(contextFile, `Item ${itemIdx} pack entry Quality Gate v2 violation: insufficient scenario token richness. Pack "${entry.id}" has ${uniqueScenarioTokens.size} unique scenario tokens (required: 6 for packs with >= 8 prompts)`);
        }

        // Check per-step scenario token presence
        if (entry.sessionPlan && Array.isArray(entry.sessionPlan.steps)) {
          entry.sessionPlan.steps.forEach((step: any, stepIdx: number) => {
            let stepHasToken = false;
            if (Array.isArray(step.promptIds)) {
              step.promptIds.forEach((promptId: string) => {
                const prompt = prompts.find(p => p.id === promptId);
                if (prompt) {
                  const textLower = prompt.text.toLowerCase();
                  for (const token of scenarioTokens) {
                    if (textLower.includes(token.toLowerCase())) {
                      stepHasToken = true;
                      break;
                    }
                  }
                }
              });
            }
            if (!stepHasToken) {
              addError(contextFile, `Item ${itemIdx} pack entry Quality Gate v2 violation: step "${step.id}" (index ${stepIdx}) in pack "${entry.id}" has no scenario tokens. All steps must contain at least one scenario token.`);
            }
          });
        }
      }

      // Quality Gates v2: Slot coverage
      if (entry.variationSlots && Array.isArray(entry.variationSlots) && entry.variationSlots.length > 0) {
        const usedSlots = new Set<string>();
        prompts.forEach(p => {
          if (p.slotsChanged && Array.isArray(p.slotsChanged)) {
            p.slotsChanged.forEach(slot => usedSlots.add(slot));
          }
          if (p.slots && typeof p.slots === 'object') {
            Object.keys(p.slots).forEach(slot => usedSlots.add(slot));
          }
        });

        const missingSlots = entry.variationSlots.filter(slot => !usedSlots.has(slot));
        if (missingSlots.length > 0) {
          addError(contextFile, `Item ${itemIdx} pack entry Quality Gate v2 violation: variation slots declared but not used. Pack "${entry.id}" declares slots [${entry.variationSlots.join(', ')}] but never uses [${missingSlots.join(', ')}] in any prompt.`);
        }
      }
    }
  }
}

/**
 * Validate drill quality gates (v4 specific)
 */
function validateDrillQualityGates(entry: any, contextFile: string, itemIdx: number): void {
  if (!entry.prompts || !Array.isArray(entry.prompts) || entry.prompts.length === 0) {
    return; // No prompts to validate
  }

  const prompts = entry.prompts.filter((p: any) => p && p.text && typeof p.text === 'string');

  if (prompts.length === 0) {
    return; // No valid prompts
  }

  // Rule 0: Inventory Enforcement (Safety Net)
  // Ensure we have enough prompts for the tier
  const isDraft = entry.review && entry.review.status === 'draft';
  if (!isDraft && typeof entry.difficultyTier === 'number') {
    const minPromptsMap: Record<number, number> = { 1: 6, 2: 8, 3: 10 };
    const minPrompts = minPromptsMap[entry.difficultyTier] || 6;

    if (prompts.length < minPrompts) {
      addError(contextFile, `Item ${itemIdx} drill entry Quality Gate violation: insufficient inventory. Drill "${entry.id}" (Tier ${entry.difficultyTier}) has ${prompts.length} prompts (required: >=${minPrompts})`);
    }
  }

  // Load mechanic template to get required tokens and banned phrases
  let mechanicTemplate: any = null;
  if (entry.mechanicId) {
    try {
      const templatePath = join(__dirname, '..', 'content', 'templates', 'v4', 'mechanics', `${entry.mechanicId}.json`);
      if (existsSync(templatePath)) {
        mechanicTemplate = JSON.parse(readFileSync(templatePath, 'utf-8'));
      }
    } catch (error: any) {
      // Template not found or invalid - skip mechanic-specific checks
    }
  }

  // Rule 1: Generic phrase denylist (drill-specific)
  const DRILL_DENYLIST_PHRASES = [
    "in today's lesson",
    "let's practice",
    "this sentence",
    "i like to",
    "the quick brown fox",
    "lorem ipsum",
    "TODO",
    "FIXME",
    "example",
    "test",
    "placeholder"
  ];

  // Add template-specific banned phrases if available
  const bannedPhrases = mechanicTemplate && Array.isArray(mechanicTemplate.bannedPhrases)
    ? [...DRILL_DENYLIST_PHRASES, ...mechanicTemplate.bannedPhrases]
    : DRILL_DENYLIST_PHRASES;

  for (const prompt of prompts) {
    const textLower = prompt.text.toLowerCase();
    for (const phrase of bannedPhrases) {
      if (textLower.includes(phrase.toLowerCase())) {
        addError(contextFile, `Item ${itemIdx} drill entry Quality Gate violation: prompt "${prompt.id || 'unknown'}" contains denylisted phrase "${phrase}"`);
        return; // Fail fast on first violation
      }
    }
  }

  // Rule 2: Mechanic token requirements (each prompt must contain >=1 token from mechanic dictionary)
  // Skip if requiredTokens is empty - nothing to check
  if (mechanicTemplate && Array.isArray(mechanicTemplate.requiredTokens) && mechanicTemplate.requiredTokens.length > 0) {
    let promptsWithoutTokens = 0;
    for (const prompt of prompts) {
      const textLower = prompt.text.toLowerCase();
      let hasToken = false;
      for (const token of mechanicTemplate.requiredTokens) {
        if (textLower.includes(token.toLowerCase())) {
          hasToken = true;
          break;
        }
      }
      if (!hasToken) {
        promptsWithoutTokens++;
      }
    }

    // Require at least 80% of prompts to have mechanic tokens
    const tokenHitRate = (prompts.length - promptsWithoutTokens) / prompts.length;
    if (tokenHitRate < 0.8) {
      addError(contextFile, `Item ${itemIdx} drill entry Quality Gate violation: insufficient mechanic token coverage. Drill "${entry.id}" has ${promptsWithoutTokens} prompts without required mechanic tokens (required: >=80% coverage)`);
    }
  }

  // Rule 3: Variation requirement (>=30% of transitions have 2+ slotsChanged)
  const multiSlotRate = computeMultiSlotRate(prompts);
  if (multiSlotRate < 0.3) {
    addError(contextFile, `Item ${itemIdx} drill entry Quality Gate violation: insufficient multi-slot variation. Drill "${entry.id}" has multiSlotRate ${(multiSlotRate * 100).toFixed(1)}% (required: >=30%)`);
  }

  // Rule 4: Coverage requirement (unique verb/subject counts)
  if (mechanicTemplate) {
    const uniqueVerbs = computeDistinctVerbs(prompts);
    const uniqueSubjects = computeDistinctSubjects(prompts);

    if (mechanicTemplate.minUniqueVerbs && uniqueVerbs < mechanicTemplate.minUniqueVerbs) {
      addError(contextFile, `Item ${itemIdx} drill entry Quality Gate violation: insufficient verb variation. Drill "${entry.id}" has ${uniqueVerbs} unique verbs (required: >=${mechanicTemplate.minUniqueVerbs})`);
    }

    if (mechanicTemplate.minUniqueSubjects && uniqueSubjects < mechanicTemplate.minUniqueSubjects) {
      addError(contextFile, `Item ${itemIdx} drill entry Quality Gate violation: insufficient subject variation. Drill "${entry.id}" has ${uniqueSubjects} unique subjects (required: >=${mechanicTemplate.minUniqueSubjects})`);
    }
  }

  // Rule 5: SessionPlan coherence (all promptIds must exist)
  if (entry.sessionPlan && Array.isArray(entry.sessionPlan.steps)) {
    const promptIds = new Set(prompts.map((p: any) => p.id).filter(Boolean));
    entry.sessionPlan.steps.forEach((step: any, stepIdx: number) => {
      if (Array.isArray(step.promptIds)) {
        step.promptIds.forEach((promptId: string) => {
          if (!promptIds.has(promptId)) {
            addError(contextFile, `Item ${itemIdx} drill entry Quality Gate violation: sessionPlan.steps[${stepIdx}] references missing promptId "${promptId}"`);
          }
        });
      }
    });
  }

  // Rule 6: Title integrity (shortTitle unique within mechanicId + level)
  // This is checked at index generation time, not here
}

/**
 * Validate context scenario index fields (groups, scope, recommended)
 */
function validateContextScenarioIndexFields(doc: any, filePath: string): void {
  // Only validate if this is a context scenario index
  const isContextScenario = doc.kind === 'context' && filePath.includes('/context/') &&
    !filePath.includes('/context/index.json') &&
    !filePath.includes('/context/scenarios.json');

  if (!isContextScenario) {
    return; // Skip validation for non-context scenario indexes
  }

  // Validate scope (optional but recommended for context scenario feeds)
  if (doc.scope !== undefined) {
    if (typeof doc.scope !== 'object' || doc.scope === null) {
      addError(filePath, 'SectionIndexPage scope must be an object if present');
    } else {
      if (doc.scope.scopeKind !== 'scenario') {
        addError(filePath, 'SectionIndexPage scope.scopeKind must be "scenario"');
      }
      if (!doc.scope.scopeId || typeof doc.scope.scopeId !== 'string') {
        addError(filePath, 'SectionIndexPage scope.scopeId must be a non-empty string');
      }
      if (!doc.scope.scopeTitle || typeof doc.scope.scopeTitle !== 'string') {
        addError(filePath, 'SectionIndexPage scope.scopeTitle must be a non-empty string');
      }
    }
  }

  // Validate recommended (optional, max 1)
  if (doc.recommended !== undefined) {
    if (typeof doc.recommended !== 'object' || doc.recommended === null) {
      addError(filePath, 'SectionIndexPage recommended must be an object if present');
    } else {
      if (!doc.recommended.itemId || typeof doc.recommended.itemId !== 'string') {
        addError(filePath, 'SectionIndexPage recommended.itemId must be a non-empty string');
      }
      if (!doc.recommended.entryUrl || typeof doc.recommended.entryUrl !== 'string') {
        addError(filePath, 'SectionIndexPage recommended.entryUrl must be a non-empty string');
      }

      // Validate recommended.itemId exists in items
      if (Array.isArray(doc.items) && doc.recommended.itemId) {
        const itemIds = new Set(doc.items.map((item: any) => item.id).filter(Boolean));
        if (!itemIds.has(doc.recommended.itemId)) {
          addError(filePath, `SectionIndexPage recommended.itemId "${doc.recommended.itemId}" does not exist in items array`);
        }
      }
    }
  }

  // Validate groups (optional)
  if (doc.groups !== undefined) {
    if (!Array.isArray(doc.groups)) {
      addError(filePath, 'SectionIndexPage groups must be an array if present');
    } else {
      const itemIds = new Set((doc.items || []).map((item: any) => item.id).filter(Boolean));
      const groupIds = new Set<string>();

      for (let i = 0; i < doc.groups.length; i++) {
        const group = doc.groups[i];

        // Validate group structure
        if (!group.id || typeof group.id !== 'string') {
          addError(filePath, `SectionIndexPage groups[${i}].id must be a non-empty string`);
        }
        if (!group.title || typeof group.title !== 'string') {
          addError(filePath, `SectionIndexPage groups[${i}].title must be a non-empty string`);
        }
        if (group.kind !== 'context_group') {
          addError(filePath, `SectionIndexPage groups[${i}].kind must be "context_group"`);
        }
        if (!Array.isArray(group.itemIds) || group.itemIds.length === 0) {
          addError(filePath, `SectionIndexPage groups[${i}].itemIds must be a non-empty array`);
        } else {
          // Validate minimum 3 items per group
          if (group.itemIds.length < 3) {
            addError(filePath, `SectionIndexPage groups[${i}].itemIds must have at least 3 items (found ${group.itemIds.length})`);
          }

          // Validate all itemIds exist in items
          for (const itemId of group.itemIds) {
            if (!itemIds.has(itemId)) {
              addError(filePath, `SectionIndexPage groups[${i}].itemIds contains "${itemId}" which does not exist in items array`);
            }
          }
        }

        // Validate title_i18n if present
        if (group.title_i18n !== undefined) {
          const i18nResult = validateI18nAndGrouping({ title_i18n: group.title_i18n });
          if (!i18nResult.valid) {
            for (const err of i18nResult.errors) {
              addError(filePath, `SectionIndexPage groups[${i}].title_i18n: ${err}`);
            }
          }
        }

        // Check for duplicate group IDs
        if (group.id && groupIds.has(group.id)) {
          addError(filePath, `SectionIndexPage groups[${i}].id "${group.id}" is duplicated`);
        }
        if (group.id) {
          groupIds.add(group.id);
        }
      }
    }
  }

  // Validate no mechanics packs in context scenario feeds
  if (Array.isArray(doc.items)) {
    for (let i = 0; i < doc.items.length; i++) {
      const item = doc.items[i];
      if (item.domainKind === 'mechanics') {
        addError(filePath, `SectionIndexPage items[${i}] has domainKind="mechanics" but appears in context scenario feed. Mechanics packs must be excluded from context feeds.`);
      }
    }
  }

  // Validate recommended count (max 1)
  if (doc.recommended && Array.isArray(doc.items)) {
    const recommendedCount = doc.items.filter((item: any) => item.isRecommended === true).length;
    if (recommendedCount > 1) {
      addError(filePath, `SectionIndexPage has ${recommendedCount} items with isRecommended=true, but maximum is 1`);
    }
    if (recommendedCount === 1 && doc.recommended) {
      const recommendedItem = doc.items.find((item: any) => item.isRecommended === true);
      if (recommendedItem && recommendedItem.id !== doc.recommended.itemId) {
        addError(filePath, `SectionIndexPage recommended.itemId "${doc.recommended.itemId}" does not match item with isRecommended=true (${recommendedItem.id})`);
      }
    }
  }
}

function validateSchemaVersion(docType: string, doc: any, filePath: string): void {
  if (typeof doc.schemaVersion !== 'number') {
    addError(filePath, `${docType} missing required field: schemaVersion (must be number)`);
    return;
  }

  if (!SUPPORTED_SCHEMA_VERSIONS.includes(doc.schemaVersion)) {
    addError(filePath, `${docType} has unsupported schemaVersion: ${doc.schemaVersion}. Supported versions: ${SUPPORTED_SCHEMA_VERSIONS.join(', ')}`);
    return;
  }

  // For schemaVersion 1, enforce required fields based on docType
  if (doc.schemaVersion === 1) {
    validateSchemaV1RequiredFields(docType, doc, filePath);
  }
}

/**
 * Validate required fields for schemaVersion 1
 * Enforces breaking change rules: no missing required fields
 */
function validateSchemaV1RequiredFields(docType: string, doc: any, filePath: string): void {
  if (docType === 'Catalog') {
    if (!doc.version || typeof doc.version !== 'string') {
      addError(filePath, 'Catalog schemaVersion 1: missing or invalid required field: version');
    }
    if (!doc.workspace || typeof doc.workspace !== 'string') {
      addError(filePath, 'Catalog schemaVersion 1: missing or invalid required field: workspace');
    }
    if (!doc.languageCode || typeof doc.languageCode !== 'string') {
      addError(filePath, 'Catalog schemaVersion 1: missing or invalid required field: languageCode');
    }
    if (!doc.languageName || typeof doc.languageName !== 'string') {
      addError(filePath, 'Catalog schemaVersion 1: missing or invalid required field: languageName');
    }
    if (!Array.isArray(doc.sections)) {
      addError(filePath, 'Catalog schemaVersion 1: missing or invalid required field: sections (must be array)');
    }
  } else if (docType === 'SectionIndexPage') {
    if (!doc.version || typeof doc.version !== 'string') {
      addError(filePath, 'SectionIndexPage schemaVersion 1: missing or invalid required field: version');
    }
    if (!doc.kind || typeof doc.kind !== 'string') {
      addError(filePath, 'SectionIndexPage schemaVersion 1: missing or invalid required field: kind');
    }
    if (typeof doc.total !== 'number') {
      addError(filePath, 'SectionIndexPage schemaVersion 1: missing or invalid required field: total');
    }
    if (typeof doc.pageSize !== 'number') {
      addError(filePath, 'SectionIndexPage schemaVersion 1: missing or invalid required field: pageSize');
    }
    if (!Array.isArray(doc.items)) {
      addError(filePath, 'SectionIndexPage schemaVersion 1: missing or invalid required field: items (must be array)');
    }
    if (doc.nextPage !== null && typeof doc.nextPage !== 'string') {
      addError(filePath, 'SectionIndexPage schemaVersion 1: invalid required field: nextPage (must be string or null)');
    }

    // Validate new fields for context scenario feeds (additive, optional)
    validateContextScenarioIndexFields(doc, filePath);
  } else if (docType === 'PackEntry') {
    if (!doc.id || typeof doc.id !== 'string') {
      addError(filePath, 'PackEntry schemaVersion 1: missing or invalid required field: id');
    }
    if (!doc.kind || typeof doc.kind !== 'string') {
      addError(filePath, 'PackEntry schemaVersion 1: missing or invalid required field: kind');
    }
    if (!doc.title || typeof doc.title !== 'string') {
      addError(filePath, 'PackEntry schemaVersion 1: missing or invalid required field: title');
    }
    if (!doc.level || typeof doc.level !== 'string') {
      addError(filePath, 'PackEntry schemaVersion 1: missing or invalid required field: level');
    }
    if (typeof doc.estimatedMinutes !== 'number') {
      addError(filePath, 'PackEntry schemaVersion 1: missing or invalid required field: estimatedMinutes');
    }
    if (!doc.description || typeof doc.description !== 'string') {
      addError(filePath, 'PackEntry schemaVersion 1: missing or invalid required field: description');
    }
    if (!Array.isArray(doc.outline)) {
      addError(filePath, 'PackEntry schemaVersion 1: missing or invalid required field: outline (must be array)');
    }
    if (!doc.sessionPlan || typeof doc.sessionPlan !== 'object') {
      addError(filePath, 'PackEntry schemaVersion 1: missing or invalid required field: sessionPlan');
    }
    // Quality Gates v1: Required fields
    if (!doc.scenario || typeof doc.scenario !== 'string') {
      addError(filePath, 'PackEntry schemaVersion 1: missing or invalid required field: scenario');
    }
    if (!doc.register || typeof doc.register !== 'string') {
      addError(filePath, 'PackEntry schemaVersion 1: missing or invalid required field: register');
    }
    if (!doc.primaryStructure || typeof doc.primaryStructure !== 'string') {
      addError(filePath, 'PackEntry schemaVersion 1: missing or invalid required field: primaryStructure');
    }
    if (!doc.packVersion || typeof doc.packVersion !== 'string') {
      addError(filePath, 'PackEntry schemaVersion 1: missing or invalid required field: packVersion (must be semver format x.y.z)');
    } else {
      const semverPattern = /^\d+\.\d+\.\d+$/;
      if (!semverPattern.test(doc.packVersion)) {
        addError(filePath, `PackEntry schemaVersion 1: packVersion "${doc.packVersion}" is not valid semver format. Must be x.y.z (e.g., "1.0.0")`);
      }
    }
  } else if (docType === 'ExamEntry') {
    if (!doc.id || typeof doc.id !== 'string') {
      addError(filePath, 'ExamEntry schemaVersion 1: missing or invalid required field: id');
    }
    if (!doc.kind || typeof doc.kind !== 'string') {
      addError(filePath, 'ExamEntry schemaVersion 1: missing or invalid required field: kind');
    }
    if (!doc.title || typeof doc.title !== 'string') {
      addError(filePath, 'ExamEntry schemaVersion 1: missing or invalid required field: title');
    }
    if (!doc.level || typeof doc.level !== 'string') {
      addError(filePath, 'ExamEntry schemaVersion 1: missing or invalid required field: level');
    }
    if (typeof doc.estimatedMinutes !== 'number') {
      addError(filePath, 'ExamEntry schemaVersion 1: missing or invalid required field: estimatedMinutes');
    }
  } else if (docType === 'DrillEntry') {
    if (!doc.id || typeof doc.id !== 'string') {
      addError(filePath, 'DrillEntry schemaVersion 1: missing or invalid required field: id');
    }
    if (!doc.kind || typeof doc.kind !== 'string') {
      addError(filePath, 'DrillEntry schemaVersion 1: missing or invalid required field: kind');
    }
    if (!doc.title || typeof doc.title !== 'string') {
      addError(filePath, 'DrillEntry schemaVersion 1: missing or invalid required field: title');
    }
    if (typeof doc.estimatedMinutes !== 'number') {
      addError(filePath, 'DrillEntry schemaVersion 1: missing or invalid required field: estimatedMinutes');
    }
  } else if (docType === 'TrackEntry') {
    if (!doc.id || typeof doc.id !== 'string') {
      addError(filePath, 'TrackEntry schemaVersion 1: missing or invalid required field: id');
    }
    if (!doc.kind || typeof doc.kind !== 'string') {
      addError(filePath, 'TrackEntry schemaVersion 1: missing or invalid required field: kind');
    }
    if (!doc.title || typeof doc.title !== 'string') {
      addError(filePath, 'TrackEntry schemaVersion 1: missing or invalid required field: title');
    }
    if (!doc.level || typeof doc.level !== 'string') {
      addError(filePath, 'TrackEntry schemaVersion 1: missing or invalid required field: level');
    }
    if (!doc.scenario || typeof doc.scenario !== 'string') {
      addError(filePath, 'TrackEntry schemaVersion 1: missing or invalid required field: scenario');
    }
    if (typeof doc.estimatedMinutes !== 'number') {
      addError(filePath, 'TrackEntry schemaVersion 1: missing or invalid required field: estimatedMinutes');
    }
    if (!doc.description || typeof doc.description !== 'string') {
      addError(filePath, 'TrackEntry schemaVersion 1: missing or invalid required field: description');
    }
    if (!Array.isArray(doc.items)) {
      addError(filePath, 'TrackEntry schemaVersion 1: missing or invalid required field: items (must be array)');
    }
    if (!doc.ordering || typeof doc.ordering !== 'object') {
      addError(filePath, 'TrackEntry schemaVersion 1: missing or invalid required field: ordering');
    }
    if (typeof doc.version !== 'number') {
      addError(filePath, 'TrackEntry schemaVersion 1: missing or invalid required field: version');
    }
  } else if (docType === 'Template') {
    if (!doc.id || typeof doc.id !== 'string') {
      addError(filePath, 'Template schemaVersion 1: missing or invalid required field: id');
    }
    if (!doc.kind || typeof doc.kind !== 'string') {
      addError(filePath, 'Template schemaVersion 1: missing or invalid required field: kind');
    }
    if (!doc.title || typeof doc.title !== 'string') {
      addError(filePath, 'Template schemaVersion 1: missing or invalid required field: title');
    }
    if (!doc.level || typeof doc.level !== 'string') {
      addError(filePath, 'Template schemaVersion 1: missing or invalid required field: level');
    }
    if (!doc.scenario || typeof doc.scenario !== 'string') {
      addError(filePath, 'Template schemaVersion 1: missing or invalid required field: scenario');
    }
    if (!doc.register || typeof doc.register !== 'string') {
      addError(filePath, 'Template schemaVersion 1: missing or invalid required field: register');
    }
    if (!doc.primaryStructure || typeof doc.primaryStructure !== 'string') {
      addError(filePath, 'Template schemaVersion 1: missing or invalid required field: primaryStructure');
    }
    if (!Array.isArray(doc.variationSlots)) {
      addError(filePath, 'Template schemaVersion 1: missing or invalid required field: variationSlots (must be array)');
    }
    if (!Array.isArray(doc.requiredScenarioTokens)) {
      addError(filePath, 'Template schemaVersion 1: missing or invalid required field: requiredScenarioTokens (must be array)');
    }
    if (!Array.isArray(doc.steps)) {
      addError(filePath, 'Template schemaVersion 1: missing or invalid required field: steps (must be array)');
    }
    if (!doc.slots || typeof doc.slots !== 'object') {
      addError(filePath, 'Template schemaVersion 1: missing or invalid required field: slots (must be object)');
    }
    if (!doc.format || typeof doc.format !== 'object') {
      addError(filePath, 'Template schemaVersion 1: missing or invalid required field: format (must be object)');
    }
  } else if (docType === 'Manifest') {
    if (!doc.activeVersion || typeof doc.activeVersion !== 'string') {
      addError(filePath, 'Manifest schemaVersion 1: missing or invalid required field: activeVersion');
    }
    if (!doc.activeWorkspace || typeof doc.activeWorkspace !== 'string') {
      addError(filePath, 'Manifest schemaVersion 1: missing or invalid required field: activeWorkspace');
    }
    if (!doc.workspaces || typeof doc.workspaces !== 'object') {
      addError(filePath, 'Manifest schemaVersion 1: missing or invalid required field: workspaces');
    }
  }
}

function validateCefrLevel(level: string, context: string, itemIdx: number): void {
  if (!VALID_CEFR_LEVELS.includes(level.toUpperCase())) {
    addError(context, `Item ${itemIdx} level "${level}" is not a valid CEFR level. Must be one of: ${VALID_CEFR_LEVELS.join(', ')}`);
  }
}

function validateDuration(minutes: number, context: string, itemIdx: number, fieldName: string): void {
  if (minutes < MIN_DURATION_MINUTES || minutes > MAX_DURATION_MINUTES) {
    addError(context, `Item ${itemIdx} ${fieldName} (${minutes}) is outside valid range [${MIN_DURATION_MINUTES}-${MAX_DURATION_MINUTES}]`);
  }
}

function validateTitle(title: string, context: string, itemIdx: number): void {
  if (title.length > MAX_TITLE_LENGTH) {
    addError(context, `Item ${itemIdx} title is too long (${title.length} chars). Max is ${MAX_TITLE_LENGTH} chars.`);
  }
}

interface PaginationResult {
  totalItems: number;
  allItemIds: Set<string>;
  pageCount: number;
}

interface FirstPageMeta {
  version: string;
  kind: string;
  pageSize: number;
  total: number;
}

/**
 * Validate pagination chain from first page
 * Enforces all invariants across pages
 */
function validatePaginationChain(
  firstPagePath: string,
  firstPageMeta: FirstPageMeta
): PaginationResult {
  const result: PaginationResult = { totalItems: 0, allItemIds: new Set<string>(), pageCount: 0 };
  const visitedPages = new Set<string>();

  let currentPath: string | null = firstPagePath;

  while (currentPath) {
    // Loop detection
    if (visitedPages.has(currentPath)) {
      addError(currentPath, 'Circular reference detected in nextPage chain (loop)');
      break;
    }
    visitedPages.add(currentPath);
    result.pageCount++;

    // Resolve path
    const resolvedPath = resolveContentPath(currentPath.replace(/^\/v1\//, ''));

    if (!existsSync(resolvedPath)) {
      addError(firstPagePath, `nextPage chain broken: file not found at ${currentPath}`);
      break;
    }

    try {
      const content = readFileSync(resolvedPath, 'utf-8');
      const page = JSON.parse(content);

      // Validate invariants match first page (only for pages after first)
      if (result.pageCount > 1) {
        if (page.version !== firstPageMeta.version) {
          addError(resolvedPath, `Pagination invariant violation: version "${page.version}" differs from first page "${firstPageMeta.version}"`);
        }
        if (page.kind !== firstPageMeta.kind) {
          addError(resolvedPath, `Pagination invariant violation: kind "${page.kind}" differs from first page "${firstPageMeta.kind}"`);
        }
        if (page.pageSize !== firstPageMeta.pageSize) {
          addError(resolvedPath, `Pagination invariant violation: pageSize ${page.pageSize} differs from first page ${firstPageMeta.pageSize}`);
        }
        if (page.total !== firstPageMeta.total) {
          addError(resolvedPath, `Pagination invariant violation: total ${page.total} differs from first page ${firstPageMeta.total}`);
        }
      }

      // Collect items and check for duplicates
      if (Array.isArray(page.items)) {
        page.items.forEach((item: any) => {
          if (item.id) {
            if (result.allItemIds.has(item.id)) {
              addError(resolvedPath, `Duplicate item ID "${item.id}" found across pagination pages`);
            }
            result.allItemIds.add(item.id);
          }
        });
        result.totalItems += page.items.length;
      }

      // Move to next page
      if (typeof page.nextPage === 'string') {
        // Validate nextPage format
        if (!page.nextPage.startsWith('/v1/')) {
          addError(resolvedPath, `nextPage "${page.nextPage}" must start with /v1/`);
          break;
        }
        if (!page.nextPage.endsWith('.json')) {
          addError(resolvedPath, `nextPage "${page.nextPage}" must end with .json`);
          break;
        }
        currentPath = page.nextPage;
      } else {
        currentPath = null;
      }

      // Soft warning: last page has fewer items than pageSize
      if (currentPath === null && Array.isArray(page.items) && page.items.length < page.pageSize) {
        // This is normal for last page - could add a debug log if needed
      }

    } catch (err: any) {
      addError(resolvedPath, `Failed to parse pagination page: ${err.message}`);
      break;
    }
  }

  // Validate total matches actual item count
  if (result.totalItems !== firstPageMeta.total) {
    addError(firstPagePath, `Pagination total mismatch: declared total is ${firstPageMeta.total} but actual item count across ${result.pageCount} page(s) is ${result.totalItems}`);
  }

  // Soft warning: tiny pageSize with large total
  if (firstPageMeta.total > 100 && firstPageMeta.pageSize < 10) {
    console.warn(`⚠️  ${firstPagePath}: Large total (${firstPageMeta.total}) with small pageSize (${firstPageMeta.pageSize}) - consider increasing pageSize`);
  }

  return result;
}

/**
 * Validate pagination across all pages of an index (legacy wrapper)
 * Returns: { totalItems: number, allItemIds: Set<string> }
 */
function validatePaginatedIndex(indexPath: string, visitedPages: Set<string> = new Set()): { totalItems: number; allItemIds: Set<string> } {
  const result = { totalItems: 0, allItemIds: new Set<string>() };

  if (visitedPages.has(indexPath)) {
    addError(indexPath, 'Circular reference detected in nextPage chain');
    return result;
  }
  visitedPages.add(indexPath);

  try {
    const resolvedPath = resolveContentPath(indexPath.replace(/^\/v1\//, ''));
    if (!existsSync(resolvedPath)) {
      return result;
    }

    const content = readFileSync(resolvedPath, 'utf-8');
    const index = JSON.parse(content);

    if (Array.isArray(index.items)) {
      index.items.forEach((item: any) => {
        if (item.id) {
          if (result.allItemIds.has(item.id)) {
            addError(indexPath, `Duplicate item ID "${item.id}" found across pagination pages`);
          }
          result.allItemIds.add(item.id);
        }
      });
      result.totalItems += index.items.length;
    }

    // Follow nextPage recursively
    if (typeof index.nextPage === 'string') {
      const nextResult = validatePaginatedIndex(index.nextPage, visitedPages);
      result.totalItems += nextResult.totalItems;
      nextResult.allItemIds.forEach(id => {
        if (result.allItemIds.has(id)) {
          addError(indexPath, `Duplicate item ID "${id}" found across pagination pages`);
        }
        result.allItemIds.add(id);
      });
    }

    return result;
  } catch (err: any) {
    return result;
  }
}

/**
 * Normalize title for duplicate detection
 * 
 * Deterministic normalization:
 * - trim() whitespace
 * - collapse internal whitespace to single spaces
 * - case-fold to lower-case
 */
function normalizeTitle(title: string): string {
  return title.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Quality Gate: Validate no duplicate titles in scenario/context index
 * 
 * For each context/{scenario}/index.json:
 * - Build a map from normalizedTitle -> { raw: string, ids: string[] }
 * - If any title has more than 1 id, fail validation
 * - Error must list the duplicate title and all offending IDs
 * 
 * This prevents recurrence of duplicate titles that make different content appear identical.
 */
function validateNoDuplicateTitles(
  indexPath: string,
  items: Array<{ id?: string; title?: string; scenario?: string }>
): void {
  // Check if this is a scenario-specific index (context/{scenario}/index.json)
  const isScenarioSpecificIndex = indexPath.includes('/context/') &&
    indexPath.match(/\/context\/[^/]+\/index\.json$/);

  // Map: normalizedTitle -> { raw: string, ids: string[] }
  const titleMap = new Map<string, { raw: string; ids: string[] }>();

  for (const item of items) {
    if (!item.title || typeof item.title !== 'string') {
      continue; // Skip items without titles (will be caught by other validations)
    }

    const normalized = normalizeTitle(item.title);
    const existing = titleMap.get(normalized);

    if (!existing) {
      // First occurrence of this normalized title
      titleMap.set(normalized, {
        raw: item.title.trim(),
        ids: [item.id || 'unknown']
      });
    } else {
      // Duplicate detected - add this ID to the list
      existing.ids.push(item.id || 'unknown');
    }
  }

  // Find all duplicates
  const duplicates = Array.from(titleMap.values()).filter(v => v.ids.length > 1);

  if (duplicates.length === 0) {
    return; // No duplicates found
  }

  // Build error message with all duplicates
  const errorLines = duplicates.map(dup => {
    return `- "${dup.raw}" used by: ${dup.ids.join(', ')}`;
  });

  if (isScenarioSpecificIndex) {
    // Extract scenario from file path for better error message
    const scenarioMatch = indexPath.match(/\/context\/([^/]+)\/index\.json$/);
    const scenario = scenarioMatch ? scenarioMatch[1] : 'unknown';
    addError(
      indexPath,
      `QUALITY GATE FAILED: Duplicate titles detected in context/${scenario}/index.json\n` +
      errorLines.join('\n')
    );
  } else {
    addError(
      indexPath,
      `QUALITY GATE FAILED: Duplicate titles detected in ${indexPath}\n` +
      errorLines.join('\n')
    );
  }
}

/**
 * Validate i18n object structure
 */
function validateI18nObject(
  i18n: any,
  fieldName: string,
  filePath: string,
  context: string,
  maxLength?: number
): boolean {
  if (i18n === undefined || i18n === null) {
    return true; // Optional field
  }

  if (typeof i18n !== 'object' || Array.isArray(i18n)) {
    addError(filePath, `${context}: ${fieldName} must be an object (Record<string, string>)`);
    return false;
  }

  let isValid = true;
  for (const [langCode, value] of Object.entries(i18n)) {
    if (typeof langCode !== 'string' || langCode.length === 0) {
      addError(filePath, `${context}: ${fieldName} has invalid language code`);
      isValid = false;
      continue;
    }

    if (typeof value !== 'string') {
      addError(filePath, `${context}: ${fieldName}[${langCode}] must be a string`);
      isValid = false;
      continue;
    }

    if (value.trim().length === 0) {
      addError(filePath, `${context}: ${fieldName}[${langCode}] must be non-empty`);
      isValid = false;
      continue;
    }

    if (maxLength && value.length > maxLength) {
      addError(filePath, `${context}: ${fieldName}[${langCode}] exceeds max length (${value.length} > ${maxLength})`);
      isValid = false;
    }
  }

  // Soft rule: warn if "en" is missing (configurable)
  const requireEn = process.env.REQUIRE_I18N_EN === 'true';
  if (!i18n.en) {
    if (requireEn) {
      addError(filePath, `${context}: ${fieldName} must include "en" key`);
      isValid = false;
    } else {
      // Just warn in dev
      console.warn(`⚠️  ${context}: ${fieldName} missing "en" key (recommended)`);
    }
  }

  return isValid;
}

function validateIndex(indexPath: string): void {
  try {
    const content = readFileSync(indexPath, 'utf-8');
    const index = JSON.parse(content);

    // Special handling for shaped drills format (has drillGroups array, not items)
    // Check this FIRST before validating version/kind/total
    if (indexPath.includes('/drills/index.json') && Array.isArray(index.drillGroups)) {
      if (!Array.isArray(index.drillGroups)) {
        addError(indexPath, 'Missing or invalid field: drillGroups (must be an array)');
        return;
      }
      // Validate drillGroups array
      index.drillGroups.forEach((group: any, idx: number) => {
        if (!group.id || typeof group.id !== 'string') {
          addError(indexPath, `DrillGroup ${idx} missing or invalid field: id (must be string)`);
        }
        if (!group.kind || group.kind !== 'drill_group') {
          addError(indexPath, `DrillGroup ${idx} missing or invalid field: kind (must be "drill_group")`);
        }
        if (!group.title || typeof group.title !== 'string') {
          addError(indexPath, `DrillGroup ${idx} missing or invalid field: title (must be string)`);
        }
        if (!group.description || typeof group.description !== 'string') {
          addError(indexPath, `DrillGroup ${idx} missing or invalid field: description (must be string)`);
        }
        if (!Array.isArray(group.tiers)) {
          addError(indexPath, `DrillGroup ${idx} missing or invalid field: tiers (must be an array)`);
        } else {
          // Validate tiers
          group.tiers.forEach((tier: any, tierIdx: number) => {
            if (!tier.id || typeof tier.id !== 'string') {
              addError(indexPath, `DrillGroup ${idx} tier ${tierIdx} missing or invalid field: id (must be string)`);
            }
            if (typeof tier.tier !== 'number') {
              addError(indexPath, `DrillGroup ${idx} tier ${tierIdx} missing or invalid field: tier (must be number)`);
            }
            if (!tier.level || typeof tier.level !== 'string') {
              addError(indexPath, `DrillGroup ${idx} tier ${tierIdx} missing or invalid field: level (must be string)`);
            }
            if (typeof tier.durationMinutes !== 'number') {
              addError(indexPath, `DrillGroup ${idx} tier ${tierIdx} missing or invalid field: durationMinutes (must be number)`);
            }
            if (!tier.status || typeof tier.status !== 'string') {
              addError(indexPath, `DrillGroup ${idx} tier ${tierIdx} missing or invalid field: status (must be string)`);
            }
            if (!tier.entryUrl || typeof tier.entryUrl !== 'string') {
              addError(indexPath, `DrillGroup ${idx} tier ${tierIdx} missing or invalid field: entryUrl (must be string)`);
            }
          });
        }
      });
      return; // Skip pagination validation for shaped drills format
    }

    // Validate required fields
    if (!index.version || typeof index.version !== 'string') {
      addError(indexPath, 'Missing or invalid field: version (must be string)');
    }
    if (!index.kind || typeof index.kind !== 'string') {
      addError(indexPath, 'Missing or invalid field: kind (must be string)');
    }
    if (typeof index.total !== 'number') {
      addError(indexPath, 'Missing or invalid field: total (must be number)');
    }

    // Special handling for mechanics_index (has mechanics array, not items)
    if (index.kind === 'mechanics_index') {
      if (!Array.isArray(index.mechanics)) {
        addError(indexPath, 'Missing or invalid field: mechanics (must be an array)');
        return;
      }
      // Validate mechanics array
      index.mechanics.forEach((mechanic: any, idx: number) => {
        if (!mechanic.id || typeof mechanic.id !== 'string') {
          addError(indexPath, `Mechanic ${idx} missing or invalid field: id (must be string)`);
        }
        if (!mechanic.title || typeof mechanic.title !== 'string') {
          addError(indexPath, `Mechanic ${idx} missing or invalid field: title (must be string)`);
        }
        if (!mechanic.itemsUrl || typeof mechanic.itemsUrl !== 'string') {
          addError(indexPath, `Mechanic ${idx} missing or invalid field: itemsUrl (must be string)`);
        }
      });
      return; // Skip pagination validation for mechanics_index
    }

    // Special handling for shaped drills format (has drillGroups array, not items)
    if (indexPath.includes('/drills/index.json') && Array.isArray(index.drillGroups)) {
      if (!Array.isArray(index.drillGroups)) {
        addError(indexPath, 'Missing or invalid field: drillGroups (must be an array)');
        return;
      }
      // Validate drillGroups array
      index.drillGroups.forEach((group: any, idx: number) => {
        if (!group.id || typeof group.id !== 'string') {
          addError(indexPath, `DrillGroup ${idx} missing or invalid field: id (must be string)`);
        }
        if (!group.kind || group.kind !== 'drill_group') {
          addError(indexPath, `DrillGroup ${idx} missing or invalid field: kind (must be "drill_group")`);
        }
        if (!group.title || typeof group.title !== 'string') {
          addError(indexPath, `DrillGroup ${idx} missing or invalid field: title (must be string)`);
        }
        if (!group.description || typeof group.description !== 'string') {
          addError(indexPath, `DrillGroup ${idx} missing or invalid field: description (must be string)`);
        }
        if (!Array.isArray(group.tiers)) {
          addError(indexPath, `DrillGroup ${idx} missing or invalid field: tiers (must be an array)`);
        } else {
          // Validate tiers
          group.tiers.forEach((tier: any, tierIdx: number) => {
            if (!tier.id || typeof tier.id !== 'string') {
              addError(indexPath, `DrillGroup ${idx} tier ${tierIdx} missing or invalid field: id (must be string)`);
            }
            if (typeof tier.tier !== 'number') {
              addError(indexPath, `DrillGroup ${idx} tier ${tierIdx} missing or invalid field: tier (must be number)`);
            }
            if (!tier.level || typeof tier.level !== 'string') {
              addError(indexPath, `DrillGroup ${idx} tier ${tierIdx} missing or invalid field: level (must be string)`);
            }
            if (typeof tier.durationMinutes !== 'number') {
              addError(indexPath, `DrillGroup ${idx} tier ${tierIdx} missing or invalid field: durationMinutes (must be number)`);
            }
            if (!tier.status || typeof tier.status !== 'string') {
              addError(indexPath, `DrillGroup ${idx} tier ${tierIdx} missing or invalid field: status (must be string)`);
            }
            if (!tier.entryUrl || typeof tier.entryUrl !== 'string') {
              addError(indexPath, `DrillGroup ${idx} tier ${tierIdx} missing or invalid field: entryUrl (must be string)`);
            }
          });
        }
      });
      return; // Skip pagination validation for shaped drills format
    }

    // Pagination fields required for other index types
    if (typeof index.pageSize !== 'number') {
      addError(indexPath, 'Missing or invalid field: pageSize (must be number)');
    } else if (index.pageSize <= 0) {
      addError(indexPath, 'Invalid field: pageSize (must be > 0)');
    }

    // Validate page number (required for pagination contract)
    if (typeof index.page !== 'number') {
      addError(indexPath, 'Missing or invalid field: page (must be number)');
    } else if (index.page < 1) {
      addError(indexPath, 'Invalid field: page (must be >= 1)');
    }

    if (!Array.isArray(index.items)) {
      addError(indexPath, 'Missing or invalid field: items (must be an array)');
      return;
    }

    // Validate items.length <= pageSize
    if (index.items.length > index.pageSize) {
      addError(indexPath, `Invalid: items.length (${index.items.length}) exceeds pageSize (${index.pageSize})`);
    }

    // Validate nextPage
    if (index.nextPage !== null && typeof index.nextPage !== 'string') {
      addError(indexPath, 'Invalid field: nextPage (must be null or string)');
    } else if (index.nextPage && typeof index.nextPage === 'string') {
      // Validate nextPage URL pattern: must match /v1/workspaces/{ws}/.../pages/{n}.json
      const nextPagePattern = /^\/v1\/workspaces\/[^/]+\/.+\/pages\/\d+\.json$/;
      if (!nextPagePattern.test(index.nextPage)) {
        addError(indexPath, `Invalid nextPage URL pattern: ${index.nextPage} (must match /v1/workspaces/{ws}/.../pages/{n}.json)`);
      } else {
        // Validate nextPage file exists
        const nextPagePath = index.nextPage.replace(/^\/v1\//, '');
        const fullPath = join(CONTENT_DIR, nextPagePath);
        if (!existsSync(fullPath)) {
          addError(indexPath, `nextPage points to non-existent file: ${index.nextPage} (expected at ${fullPath})`);
        }
      }
    }

    // Validate items
    index.items.forEach((item: any, idx: number) => {
      if (!item.id || typeof item.id !== 'string') {
        addError(indexPath, `Item ${idx} missing or invalid field: id (must be string)`);
      }
      if (!item.kind || typeof item.kind !== 'string') {
        addError(indexPath, `Item ${idx} missing or invalid field: kind (must be string: "pack", "exam", or "drill")`);
      } else {
        // Validate kind is one of the allowed values
        const validKinds = ['pack', 'exam', 'drill', 'track'];
        if (!validKinds.includes(item.kind.toLowerCase())) {
          addError(indexPath, `Item ${idx} kind must be one of: "pack", "exam", "drill", "track"`);
        }
      }
      if (!item.title || typeof item.title !== 'string') {
        addError(indexPath, `Item ${idx} missing or invalid field: title (must be string)`);
      } else {
        // Validate title length
        validateTitle(item.title, indexPath, idx);
      }

      // Validate i18n and grouping fields (optional, but must be valid if present)
      const i18nResult = validateI18nAndGrouping(item);
      if (!i18nResult.valid) {
        for (const err of i18nResult.errors) {
          addError(indexPath, `Item ${idx} i18n validation: ${err}`);
        }
      }
      // Log warnings but don't fail
      for (const warning of i18nResult.warnings) {
        console.warn(`⚠️  Item ${idx} in ${indexPath}: ${warning}`);
      }

      // Additional i18n validation for index items
      if (item.shortTitle_i18n) {
        validateI18nObject(item.shortTitle_i18n, 'shortTitle_i18n', indexPath, `Item ${idx}`, 28);
      }
      if (item.subtitle_i18n) {
        validateI18nObject(item.subtitle_i18n, 'subtitle_i18n', indexPath, `Item ${idx}`);
      }
      if (item.topicLabel_i18n) {
        validateI18nObject(item.topicLabel_i18n, 'topicLabel_i18n', indexPath, `Item ${idx}`);
      }

      if (!item.level || typeof item.level !== 'string' || item.level.trim() === '') {
        addError(indexPath, `Item ${idx} missing or invalid field: level (must be non-empty string)`);
      } else {
        // Validate CEFR level
        validateCefrLevel(item.level, indexPath, idx);
      }
      if (!item.entryUrl || typeof item.entryUrl !== 'string') {
        addError(indexPath, `Item ${idx} missing or invalid field: entryUrl (must be string)`);
      } else {
        // Validate entryUrl format
        if (!item.entryUrl.startsWith('/v1/') || !item.entryUrl.endsWith('.json')) {
          addError(indexPath, `Item ${idx} entryUrl must start with /v1/ and end with .json`);
        } else {
          // Validate entryUrl matches canonical pattern based on kind
          const itemKind = item.kind || index.kind; // Prefer item.kind, fallback to section kind
          validateEntryUrlPattern(item.entryUrl, item.id, itemKind, indexPath, idx);

          // Validate entryUrl file exists
          validateJsonPath(item.entryUrl, `items[${idx}].entryUrl`);

          // Validate entry document schema
          const entryPath = resolveContentPath(item.entryUrl);
          if (existsSync(entryPath)) {
            // Tracks don't have telemetry identifiers, skip that validation
            if (item.kind === 'track') {
              // Track validation is done in validateEntryDocument, but we skip telemetry checks
              validateEntryDocument(entryPath, item.kind, indexPath, idx);
            } else {
              validateEntryDocument(entryPath, item.kind, indexPath, idx);
            }

            // Validate index item metadata matches pack metadata (if present)
            if (item.kind === 'pack' || item.kind === 'context') {
              try {
                const entryContent = readFileSync(entryPath, 'utf-8');
                const entry = JSON.parse(entryContent);

                // Validate analyticsSummary (required for pack items)
                if (item.kind === 'pack') {
                  if (!item.analyticsSummary || typeof item.analyticsSummary !== 'object') {
                    addError(indexPath, `Item ${idx} (pack) missing required field: analyticsSummary`);
                  } else {
                    const summary = item.analyticsSummary;

                    // Validate required fields
                    if (!summary.primaryStructure || typeof summary.primaryStructure !== 'string') {
                      addError(indexPath, `Item ${idx} analyticsSummary.primaryStructure missing or invalid`);
                    } else if (entry.primaryStructure && summary.primaryStructure !== entry.primaryStructure) {
                      addError(indexPath, `Item ${idx} analyticsSummary.primaryStructure "${summary.primaryStructure}" does not match pack primaryStructure "${entry.primaryStructure}"`);
                    }

                    if (!Array.isArray(summary.variationSlots) || summary.variationSlots.length === 0) {
                      addError(indexPath, `Item ${idx} analyticsSummary.variationSlots missing or invalid (must be non-empty array)`);
                    } else if (entry.variationSlots && Array.isArray(entry.variationSlots)) {
                      const itemSlots = [...summary.variationSlots].sort();
                      const entrySlots = [...entry.variationSlots].sort();
                      if (JSON.stringify(itemSlots) !== JSON.stringify(entrySlots)) {
                        addError(indexPath, `Item ${idx} analyticsSummary.variationSlots does not match pack variationSlots`);
                      }
                    }

                    if (!summary.drillType || typeof summary.drillType !== 'string') {
                      addError(indexPath, `Item ${idx} analyticsSummary.drillType missing or invalid`);
                    } else if (entry.analytics?.drillType && summary.drillType !== entry.analytics.drillType) {
                      addError(indexPath, `Item ${idx} analyticsSummary.drillType "${summary.drillType}" does not match pack analytics.drillType "${entry.analytics.drillType}"`);
                    }

                    if (!summary.cognitiveLoad || typeof summary.cognitiveLoad !== 'string') {
                      addError(indexPath, `Item ${idx} analyticsSummary.cognitiveLoad missing or invalid`);
                    } else if (!['low', 'medium', 'high'].includes(summary.cognitiveLoad)) {
                      addError(indexPath, `Item ${idx} analyticsSummary.cognitiveLoad must be one of: low, medium, high`);
                    } else if (entry.analytics?.cognitiveLoad && summary.cognitiveLoad !== entry.analytics.cognitiveLoad) {
                      addError(indexPath, `Item ${idx} analyticsSummary.cognitiveLoad "${summary.cognitiveLoad}" does not match pack analytics.cognitiveLoad "${entry.analytics.cognitiveLoad}"`);
                    }

                    if (!summary.goal || typeof summary.goal !== 'string') {
                      addError(indexPath, `Item ${idx} analyticsSummary.goal missing or invalid`);
                    } else {
                      if (summary.goal.length > 120) {
                        addError(indexPath, `Item ${idx} analyticsSummary.goal too long (${summary.goal.length} chars, max 120)`);
                      }
                      // Check for TODO/generic phrases
                      const goalLower = summary.goal.toLowerCase();
                      if (goalLower.includes('todo') || goalLower.includes('fixme') || goalLower.includes('tbd')) {
                        addError(indexPath, `Item ${idx} analyticsSummary.goal contains TODO/FIXME/TBD placeholder`);
                      }
                      const genericPhrases = ['practice german', 'learn german', 'study german', 'improve german', 'practice language', 'learn language', 'study language', 'improve language', 'practice speaking', 'practice grammar', 'practice vocabulary', 'generic practice', 'basic practice', 'simple practice', 'general practice', 'placeholder'];
                      for (const phrase of genericPhrases) {
                        if (goalLower.includes(phrase)) {
                          addError(indexPath, `Item ${idx} analyticsSummary.goal contains generic phrase: "${phrase}"`);
                          break;
                        }
                      }
                    }

                    if (!Array.isArray(summary.whyThisWorks)) {
                      addError(indexPath, `Item ${idx} analyticsSummary.whyThisWorks missing or invalid (must be array)`);
                    } else {
                      if (summary.whyThisWorks.length < 2 || summary.whyThisWorks.length > 4) {
                        addError(indexPath, `Item ${idx} analyticsSummary.whyThisWorks must have 2-4 items, got ${summary.whyThisWorks.length}`);
                      }
                      summary.whyThisWorks.forEach((bullet: any, bIdx: number) => {
                        if (typeof bullet !== 'string') {
                          addError(indexPath, `Item ${idx} analyticsSummary.whyThisWorks[${bIdx}] must be a string`);
                        } else if (bullet.length > 80) {
                          addError(indexPath, `Item ${idx} analyticsSummary.whyThisWorks[${bIdx}] too long (${bullet.length} chars, max 80)`);
                        }
                        // Check for TODO/generic phrases
                        const bulletLower = bullet.toLowerCase();
                        if (bulletLower.includes('todo') || bulletLower.includes('fixme') || bulletLower.includes('tbd')) {
                          addError(indexPath, `Item ${idx} analyticsSummary.whyThisWorks[${bIdx}] contains TODO/FIXME/TBD placeholder`);
                        }
                      });
                    }
                  }
                }

                // Check scenario
                if (item.scenario !== undefined && entry.scenario !== undefined) {
                  if (item.scenario !== entry.scenario) {
                    addError(indexPath, `Item ${idx} scenario "${item.scenario}" does not match pack scenario "${entry.scenario}"`);
                  }
                } else if (entry.scenario && !item.scenario) {
                  // Warn if pack has scenario but index doesn't (non-fatal)
                  console.warn(`⚠️  Item ${idx} in ${indexPath} is not enriched with scenario. Pack has scenario "${entry.scenario}" but index item is missing it.`);
                }

                // Check register
                if (item.register !== undefined && entry.register !== undefined) {
                  if (item.register !== entry.register) {
                    addError(indexPath, `Item ${idx} register "${item.register}" does not match pack register "${entry.register}"`);
                  }
                } else if (entry.register && !item.register) {
                  console.warn(`⚠️  Item ${idx} in ${indexPath} is not enriched with register. Pack has register "${entry.register}" but index item is missing it.`);
                }

                // Check primaryStructure
                if (item.primaryStructure !== undefined && entry.primaryStructure !== undefined) {
                  if (item.primaryStructure !== entry.primaryStructure) {
                    addError(indexPath, `Item ${idx} primaryStructure "${item.primaryStructure}" does not match pack primaryStructure "${entry.primaryStructure}"`);
                  }
                } else if (entry.primaryStructure && !item.primaryStructure) {
                  console.warn(`⚠️  Item ${idx} in ${indexPath} is not enriched with primaryStructure. Pack has primaryStructure "${entry.primaryStructure}" but index item is missing it.`);
                }

                // Check tags (array comparison)
                if (item.tags !== undefined && entry.tags !== undefined) {
                  const itemTags = Array.isArray(item.tags) ? item.tags.sort() : [];
                  const entryTags = Array.isArray(entry.tags) ? entry.tags.sort() : [];
                  if (JSON.stringify(itemTags) !== JSON.stringify(entryTags)) {
                    // Warn but don't fail - tags can be filtered/curated in index
                    console.warn(`⚠️  Item ${idx} in ${indexPath} tags differ from pack tags. Index: [${itemTags.join(', ')}], Pack: [${entryTags.join(', ')}]`);
                  }
                } else if (entry.tags && Array.isArray(entry.tags) && entry.tags.length > 0 && !item.tags) {
                  console.warn(`⚠️  Item ${idx} in ${indexPath} is not enriched with tags. Pack has tags [${entry.tags.join(', ')}] but index item is missing them.`);
                }
              } catch (err: any) {
                // If we can't parse the entry, skip metadata validation (entry validation will catch it)
              }
            }
          }
        }
      }

      // Validate topic grouping metadata (optional fields, for pack items)
      // topicKey validation
      if (item.topicKey !== undefined) {
        if (typeof item.topicKey !== 'string') {
          addError(indexPath, `Item ${idx} topicKey must be a string`);
        } else {
          // Must be kebab-case
          if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.topicKey)) {
            addError(indexPath, `Item ${idx} topicKey must be kebab-case: ^[a-z0-9]+(?:-[a-z0-9]+)*$`);
          }
          // Length <= 64
          if (item.topicKey.length > 64) {
            addError(indexPath, `Item ${idx} topicKey too long (${item.topicKey.length} chars, max 64)`);
          }
        }
      }

      // topicLabel validation
      if (item.topicLabel !== undefined) {
        if (typeof item.topicLabel !== 'string') {
          addError(indexPath, `Item ${idx} topicLabel must be a string`);
        } else {
          // Length 3..60
          if (item.topicLabel.length < 3) {
            addError(indexPath, `Item ${idx} topicLabel too short (${item.topicLabel.length} chars, min 3)`);
          }
          if (item.topicLabel.length > 60) {
            addError(indexPath, `Item ${idx} topicLabel too long (${item.topicLabel.length} chars, max 60)`);
          }
          // Must not be purely numeric
          if (/^\d+$/.test(item.topicLabel)) {
            addError(indexPath, `Item ${idx} topicLabel must not be purely numeric`);
          }
          // Warn about generic labels
          const genericLabels = ['general', 'basics', 'introduction', 'part', 'pack', 'lesson', 'unit', 'module'];
          if (genericLabels.includes(item.topicLabel.toLowerCase().trim())) {
            console.warn(`⚠️  Item ${idx} in ${indexPath} topicLabel "${item.topicLabel}" is a generic value`);
          }
        }
      }

      // shortTitle validation
      if (item.shortTitle !== undefined) {
        if (typeof item.shortTitle !== 'string') {
          addError(indexPath, `Item ${idx} shortTitle must be a string`);
        } else {
          // Length 3..28 (hard fail > 28)
          if (item.shortTitle.length < 3) {
            addError(indexPath, `Item ${idx} shortTitle too short (${item.shortTitle.length} chars, min 3)`);
          }
          if (item.shortTitle.length > 28) {
            addError(indexPath, `Item ${idx} shortTitle too long (${item.shortTitle.length} chars, max 28)`);
          }
        }
      }

      // orderInTopic validation
      if (item.orderInTopic !== undefined) {
        if (typeof item.orderInTopic !== 'number') {
          addError(indexPath, `Item ${idx} orderInTopic must be a number`);
        } else if (!Number.isInteger(item.orderInTopic)) {
          addError(indexPath, `Item ${idx} orderInTopic must be an integer`);
        } else if (item.orderInTopic < 1) {
          addError(indexPath, `Item ${idx} orderInTopic must be >= 1`);
        }
      }

      // Soft warning: for pack items, warn if none of topic fields present after generation
      if ((item.kind === 'pack' || item.kind === 'context') &&
        !item.topicKey && !item.topicLabel && !item.shortTitle) {
        console.warn(`⚠️  Item ${idx} in ${indexPath} is a pack but missing topic grouping fields (topicKey/topicLabel/shortTitle)`);
      }

      // durationMinutes - validate type and bounds
      if (item.durationMinutes !== undefined) {
        if (typeof item.durationMinutes !== 'number') {
          addError(indexPath, `Item ${idx} durationMinutes must be a number if present`);
        } else {
          validateDuration(item.durationMinutes, indexPath, idx, 'durationMinutes');
        }
      }
    });

    // Quality Gate: Validate unique titles within scenario/context index
    // Normalize titles and check for duplicates (fails publish if found)
    validateNoDuplicateTitles(indexPath, index.items);

    // Validate nextPage file exists if it's a string
    if (typeof index.nextPage === 'string') {
      if (!index.nextPage.startsWith('/v1/') || !index.nextPage.endsWith('.json')) {
        addError(indexPath, 'nextPage must start with /v1/ and end with .json');
      } else {
        validateJsonPath(index.nextPage, 'nextPage');
      }
    }

    // For first page (index.json), validate entire pagination chain with full invariants
    if (indexPath.endsWith('index.json') && !indexPath.includes('.page')) {
      const relPath = '/v1/' + relative(CONTENT_DIR, indexPath).replace(/\\/g, '/');

      // Use full pagination chain validation with invariant checks
      const firstPageMeta: FirstPageMeta = {
        version: index.version || '',
        kind: index.kind || '',
        pageSize: index.pageSize || 0,
        total: index.total || 0
      };

      const paginationResult = validatePaginationChain(relPath, firstPageMeta);

      // Log pagination stats for multi-page indexes
      if (paginationResult.pageCount > 1) {
        console.log(`   📄 ${relPath}: ${paginationResult.pageCount} pages, ${paginationResult.totalItems} items`);
      }
    }
  } catch (err: any) {
    addError(indexPath, `Failed to parse JSON: ${err.message}`);
  }
}

/**
 * Validate scenario index (context/scenarios.json)
 */
function validateScenarioIndex(scenarioIndexPath: string): void {
  try {
    const content = readFileSync(scenarioIndexPath, 'utf-8');
    const scenarioIndex = JSON.parse(content);

    // Validate required fields
    if (typeof scenarioIndex.version !== 'number' || scenarioIndex.version !== 1) {
      addError(scenarioIndexPath, 'Missing or invalid field: version (must be 1)');
    }
    if (!scenarioIndex.kind || scenarioIndex.kind !== 'scenario_index') {
      addError(scenarioIndexPath, 'Missing or invalid field: kind (must be "scenario_index")');
    }
    if (!Array.isArray(scenarioIndex.items)) {
      addError(scenarioIndexPath, 'Missing or invalid field: items (must be an array)');
      return;
    }

    // Validate each scenario item
    const scenarioIds = new Set<string>();
    scenarioIndex.items.forEach((item: any, idx: number) => {
      if (!item.id || typeof item.id !== 'string') {
        addError(scenarioIndexPath, `Item ${idx} missing or invalid field: id (must be string)`);
      } else {
        if (scenarioIds.has(item.id)) {
          addError(scenarioIndexPath, `Item ${idx} duplicate scenario id: "${item.id}"`);
        }
        scenarioIds.add(item.id);
      }

      if (!item.title || typeof item.title !== 'string') {
        addError(scenarioIndexPath, `Item ${idx} missing or invalid field: title (must be string)`);
      }

      if (!item.subtitle || typeof item.subtitle !== 'string') {
        addError(scenarioIndexPath, `Item ${idx} missing or invalid field: subtitle (must be string)`);
      }

      if (!item.icon || typeof item.icon !== 'string') {
        addError(scenarioIndexPath, `Item ${idx} missing or invalid field: icon (must be string)`);
      }

      if (typeof item.itemCount !== 'number' || item.itemCount < 0) {
        addError(scenarioIndexPath, `Item ${idx} missing or invalid field: itemCount (must be non-negative number)`);
      }

      if (!item.itemsUrl || typeof item.itemsUrl !== 'string') {
        addError(scenarioIndexPath, `Item ${idx} missing or invalid field: itemsUrl (must be string)`);
      } else {
        // Validate itemsUrl format
        if (!item.itemsUrl.startsWith('/v1/') || !item.itemsUrl.endsWith('.json')) {
          addError(scenarioIndexPath, `Item ${idx} itemsUrl must start with /v1/ and end with .json`);
        } else {
          // Validate itemsUrl exists
          const itemsUrlPath = resolveContentPath(item.itemsUrl);
          if (!existsSync(itemsUrlPath)) {
            addError(scenarioIndexPath, `Item ${idx} itemsUrl "${item.itemsUrl}" does not exist (resolved to: ${itemsUrlPath})`);
          } else {
            // Validate that itemCount matches the actual total in the scenario index
            try {
              const itemsContent = readFileSync(itemsUrlPath, 'utf-8');
              const itemsIndex = JSON.parse(itemsContent);

              if (typeof itemsIndex.total === 'number') {
                if (itemsIndex.total !== item.itemCount) {
                  addError(scenarioIndexPath, `Item ${idx} itemCount (${item.itemCount}) does not match scenario index total (${itemsIndex.total})`);
                }
              } else {
                // If total is missing, count items across pagination
                const paginationResult = validatePaginatedIndex(item.itemsUrl);
                if (paginationResult.totalItems !== item.itemCount) {
                  addError(scenarioIndexPath, `Item ${idx} itemCount (${item.itemCount}) does not match actual items in scenario index (${paginationResult.totalItems})`);
                }
              }
            } catch (err: any) {
              addError(scenarioIndexPath, `Item ${idx} failed to validate itemsUrl: ${err.message}`);
            }
          }
        }
      }
    });
  } catch (error: any) {
    addError(scenarioIndexPath, `Failed to validate scenario index: ${error.message}`);
  }
}

function validateFeatured(featuredPath: string): void {
  try {
    const content = readFileSync(featuredPath, 'utf-8');
    const featured = JSON.parse(content);

    // Validate required fields
    if (featured.version !== 1) {
      addError(featuredPath, 'Featured version must be 1');
    }
    if (!featured.workspace || typeof featured.workspace !== 'string') {
      addError(featuredPath, 'Missing or invalid field: workspace (must be string)');
    }
    if (!featured.generatedAt || typeof featured.generatedAt !== 'string') {
      addError(featuredPath, 'Missing or invalid field: generatedAt (must be string)');
    } else {
      // Validate ISO date
      const date = new Date(featured.generatedAt);
      if (isNaN(date.getTime())) {
        addError(featuredPath, 'generatedAt must be valid ISO 8601 format');
      }
    }

    // Validate hero (required)
    if (!featured.hero || typeof featured.hero !== 'object') {
      addError(featuredPath, 'Missing or invalid field: hero (must be object)');
      return; // Can't continue without hero
    }

    const hero = featured.hero;
    if (!['track', 'pack', 'exam', 'drill'].includes(hero.kind)) {
      addError(featuredPath, `hero.kind must be one of: track, pack, exam, drill, got "${hero.kind}"`);
    }
    if (!hero.entryUrl || typeof hero.entryUrl !== 'string') {
      addError(featuredPath, 'hero.entryUrl is required and must be a string');
    } else {
      // Validate entryUrl pattern matches kind
      const normalizedKind = hero.kind.toLowerCase();
      let expectedPattern: RegExp;
      if (normalizedKind === 'pack') {
        expectedPattern = /^\/v1\/workspaces\/[^/]+\/packs\/[^/]+\/pack\.json$/;
      } else if (normalizedKind === 'exam') {
        expectedPattern = /^\/v1\/workspaces\/[^/]+\/exams\/[^/]+\/exam\.json$/;
      } else if (normalizedKind === 'drill') {
        expectedPattern = /^\/v1\/workspaces\/[^/]+\/drills\/[^/]+\/drill\.json$/;
      } else if (normalizedKind === 'track') {
        expectedPattern = /^\/v1\/workspaces\/[^/]+\/tracks\/[^/]+\/track\.json$/;
      } else {
        expectedPattern = /^\/v1\/workspaces\/[^/]+\/[^/]+\/[^/]+\/[^/]+\.json$/;
      }

      if (!expectedPattern.test(hero.entryUrl)) {
        addError(featuredPath, `hero.entryUrl "${hero.entryUrl}" does not match canonical pattern for kind "${hero.kind}"`);
      } else {
        // Validate entry exists
        const entryPath = resolveContentPath(hero.entryUrl);
        if (!existsSync(entryPath)) {
          addError(featuredPath, `hero.entryUrl "${hero.entryUrl}" does not exist (resolved to: ${entryPath})`);
        } else {
          // Validate entry kind matches
          try {
            const entryContent = readFileSync(entryPath, 'utf-8');
            const entry = JSON.parse(entryContent);
            if (entry.kind && entry.kind.toLowerCase() !== normalizedKind) {
              addError(featuredPath, `hero.entryUrl kind "${entry.kind}" does not match hero.kind "${hero.kind}"`);
            }

            // If referenced entry is generated content, it must be approved
            if (entry.provenance && entry.provenance.source !== 'handcrafted') {
              if (!entry.review || entry.review.status !== 'approved') {
                addError(featuredPath, `hero.entryUrl references generated content that is not approved (status: ${entry.review?.status || 'missing'})`);
              }
            }
          } catch (err: any) {
            addError(featuredPath, `Failed to read hero entry: ${err.message}`);
          }
        }
      }
    }

    if (!hero.cta || typeof hero.cta !== 'object') {
      addError(featuredPath, 'hero.cta is required and must be an object');
    } else {
      if (!hero.cta.label || typeof hero.cta.label !== 'string') {
        addError(featuredPath, 'hero.cta.label is required and must be a string');
      }
      if (hero.cta.action !== 'open_entry') {
        addError(featuredPath, `hero.cta.action must be "open_entry", got "${hero.cta.action}"`);
      }
    }

    // Validate cards (0-4)
    if (!Array.isArray(featured.cards)) {
      addError(featuredPath, 'cards must be an array');
    } else {
      if (featured.cards.length > 4) {
        addError(featuredPath, `cards length must be 0-4, got ${featured.cards.length}`);
      }

      const usedEntryUrls = new Set<string>();
      if (hero.entryUrl) {
        usedEntryUrls.add(hero.entryUrl);
      }

      featured.cards.forEach((card: any, idx: number) => {
        if (!card.id || typeof card.id !== 'string') {
          addError(featuredPath, `cards[${idx}].id is required and must be a string`);
        }
        if (!['pack', 'drill', 'exam', 'track'].includes(card.kind)) {
          addError(featuredPath, `cards[${idx}].kind must be one of: pack, drill, exam, track, got "${card.kind}"`);
        }
        if (!card.entryUrl || typeof card.entryUrl !== 'string') {
          addError(featuredPath, `cards[${idx}].entryUrl is required and must be a string`);
        } else {
          // Check for duplicates
          if (usedEntryUrls.has(card.entryUrl)) {
            addError(featuredPath, `cards[${idx}].entryUrl "${card.entryUrl}" is duplicate (already used in hero or another card)`);
          }
          usedEntryUrls.add(card.entryUrl);

          // Validate entryUrl pattern matches kind
          const normalizedKind = card.kind.toLowerCase();
          let expectedPattern: RegExp;
          if (normalizedKind === 'pack') {
            expectedPattern = /^\/v1\/workspaces\/[^/]+\/packs\/[^/]+\/pack\.json$/;
          } else if (normalizedKind === 'exam') {
            expectedPattern = /^\/v1\/workspaces\/[^/]+\/exams\/[^/]+\/exam\.json$/;
          } else if (normalizedKind === 'drill') {
            expectedPattern = /^\/v1\/workspaces\/[^/]+\/drills\/[^/]+\/drill\.json$/;
          } else if (normalizedKind === 'track') {
            expectedPattern = /^\/v1\/workspaces\/[^/]+\/tracks\/[^/]+\/track\.json$/;
          } else {
            expectedPattern = /^\/v1\/workspaces\/[^/]+\/[^/]+\/[^/]+\/[^/]+\.json$/;
          }

          if (!expectedPattern.test(card.entryUrl)) {
            addError(featuredPath, `cards[${idx}].entryUrl "${card.entryUrl}" does not match canonical pattern for kind "${card.kind}"`);
          } else {
            // Validate entry exists
            const entryPath = resolveContentPath(card.entryUrl);
            if (!existsSync(entryPath)) {
              addError(featuredPath, `cards[${idx}].entryUrl "${card.entryUrl}" does not exist (resolved to: ${entryPath})`);
            } else {
              // Validate entry kind matches
              try {
                const entryContent = readFileSync(entryPath, 'utf-8');
                const entry = JSON.parse(entryContent);
                if (entry.kind && entry.kind.toLowerCase() !== normalizedKind) {
                  addError(featuredPath, `cards[${idx}].entryUrl kind "${entry.kind}" does not match card.kind "${card.kind}"`);
                }

                // If referenced entry is generated content, it must be approved
                if (entry.provenance && entry.provenance.source !== 'handcrafted') {
                  if (!entry.review || entry.review.status !== 'approved') {
                    addError(featuredPath, `cards[${idx}].entryUrl references generated content that is not approved (status: ${entry.review?.status || 'missing'})`);
                  }
                }
              } catch (err: any) {
                addError(featuredPath, `Failed to read card[${idx}] entry: ${err.message}`);
              }
            }
          }
        }
      });
    }

  } catch (err: any) {
    addError(featuredPath, `Failed to parse featured.json: ${err.message}`);
  }
}

function validateJsonFile(filePath: string): void {
  try {
    const content = readFileSync(filePath, 'utf-8');
    JSON.parse(content);
  } catch (err: any) {
    addError(filePath, `Invalid JSON: ${err.message}`);
  }
}

/**
 * Validate template document
 */
function validateTemplate(templatePath: string): void {
  try {
    const content = readFileSync(templatePath, 'utf-8');
    const template = JSON.parse(content);

    // Validate schemaVersion
    validateSchemaVersion('Template', template, templatePath);

    // Required fields
    if (!template.id || typeof template.id !== 'string') {
      addError(templatePath, 'Template missing or invalid field: id (must be string)');
    }
    if (!template.kind || template.kind !== 'template') {
      addError(templatePath, 'Template missing or invalid field: kind (must be "template")');
    }
    if (!template.title || typeof template.title !== 'string') {
      addError(templatePath, 'Template missing or invalid field: title (must be string)');
    } else if (template.title.length > MAX_TITLE_LENGTH) {
      addError(templatePath, `Template title is too long (${template.title.length} chars). Max is ${MAX_TITLE_LENGTH} chars.`);
    }
    if (!template.level || typeof template.level !== 'string') {
      addError(templatePath, 'Template missing or invalid field: level (must be string)');
    } else if (!VALID_CEFR_LEVELS.includes(template.level.toUpperCase())) {
      addError(templatePath, `Template level "${template.level}" is not a valid CEFR level. Must be one of: ${VALID_CEFR_LEVELS.join(', ')}`);
    }
    if (!template.scenario || typeof template.scenario !== 'string') {
      addError(templatePath, 'Template missing or invalid field: scenario (must be string, 3-40 chars)');
    } else if (template.scenario.length < 3 || template.scenario.length > 40) {
      addError(templatePath, `Template scenario length is invalid (${template.scenario.length} chars). Must be 3-40 chars.`);
    }
    if (!template.register || typeof template.register !== 'string') {
      addError(templatePath, 'Template missing or invalid field: register (must be "formal", "neutral", or "informal")');
    } else if (!['formal', 'neutral', 'casual', 'informal'].includes(template.register)) {
      addError(templatePath, `Template register must be one of: "formal", "neutral", "informal"`);
    }
    if (!template.primaryStructure || typeof template.primaryStructure !== 'string') {
      addError(templatePath, 'Template missing or invalid field: primaryStructure (must be string, 3-60 chars)');
    } else if (template.primaryStructure.length < 3 || template.primaryStructure.length > 60) {
      addError(templatePath, `Template primaryStructure length is invalid (${template.primaryStructure.length} chars). Must be 3-60 chars.`);
    }
    if (!Array.isArray(template.variationSlots) || template.variationSlots.length === 0) {
      addError(templatePath, 'Template missing or invalid field: variationSlots (must be non-empty array)');
    } else {
      const validSlots = ['subject', 'verb', 'object', 'modifier', 'tense', 'polarity', 'time', 'location'];
      for (const slot of template.variationSlots) {
        if (!validSlots.includes(slot)) {
          addError(templatePath, `Template variationSlots contains invalid slot "${slot}". Valid slots: ${validSlots.join(', ')}`);
        }
      }
    }
    if (!Array.isArray(template.requiredScenarioTokens) || template.requiredScenarioTokens.length === 0) {
      addError(templatePath, 'Template missing or invalid field: requiredScenarioTokens (must be non-empty array)');
    }
    if (!Array.isArray(template.steps) || template.steps.length === 0) {
      addError(templatePath, 'Template missing or invalid field: steps (must be non-empty array)');
    } else {
      template.steps.forEach((step: any, idx: number) => {
        if (!step.id || typeof step.id !== 'string') {
          addError(templatePath, `Template steps[${idx}] missing or invalid field: id (must be string)`);
        }
        if (!step.title || typeof step.title !== 'string') {
          addError(templatePath, `Template steps[${idx}] missing or invalid field: title (must be string)`);
        }
        if (typeof step.promptCount !== 'number' || step.promptCount < 1) {
          addError(templatePath, `Template steps[${idx}] missing or invalid field: promptCount (must be number >= 1)`);
        }
        if (!Array.isArray(step.slots) || step.slots.length === 0) {
          addError(templatePath, `Template steps[${idx}] missing or invalid field: slots (must be non-empty array)`);
        } else {
          // Validate step slots are subset of variationSlots
          for (const slot of step.slots) {
            if (!template.variationSlots.includes(slot)) {
              addError(templatePath, `Template steps[${idx}].slots contains "${slot}" which is not in variationSlots`);
            }
          }
        }
      });
    }
    if (!template.slots || typeof template.slots !== 'object') {
      addError(templatePath, 'Template missing or invalid field: slots (must be object)');
    } else {
      const slotKeys = Object.keys(template.slots);
      if (slotKeys.length === 0) {
        addError(templatePath, 'Template slots must contain at least one slot type');
      } else {
        for (const slotKey of slotKeys) {
          const slotValues = template.slots[slotKey];
          if (!Array.isArray(slotValues) || slotValues.length === 0) {
            addError(templatePath, `Template slots["${slotKey}"] must be a non-empty array`);
          } else {
            for (const value of slotValues) {
              if (typeof value !== 'string' || value.trim() === '') {
                addError(templatePath, `Template slots["${slotKey}"] contains invalid value (must be non-empty string)`);
              }
            }
          }
        }
      }
    }
    if (!template.format || typeof template.format !== 'object') {
      addError(templatePath, 'Template missing or invalid field: format (must be object)');
    } else if (!template.format.pattern || typeof template.format.pattern !== 'string') {
      addError(templatePath, 'Template format.pattern must be a string');
    }

    // Validate requiredScenarioTokens are scenario-appropriate
    // Scenario token dictionaries (from QUALITY_GATES.md)
    const SCENARIO_TOKEN_DICTS: Record<string, string[]> = {
      work: ['meeting', 'shift', 'manager', 'schedule', 'invoice', 'deadline', 'office', 'colleague', 'project', 'task', 'besprechung', 'termin', 'büro', 'kollege', 'projekt', 'aufgabe', 'arbeit'],
      restaurant: ['menu', 'order', 'bill', 'reservation', 'waiter', 'table', 'food', 'drink', 'kitchen', 'service', 'speisekarte', 'bestellen', 'kellner', 'tisch', 'essen', 'trinken', 'reservierung'],
      shopping: ['price', 'buy', 'cost', 'store', 'cashier', 'payment', 'discount', 'receipt', 'cart', 'checkout', 'kaufen', 'laden', 'kasse', 'zahlung', 'rabatt', 'quittung', 'warenkorb'],
      doctor: ['appointment', 'symptom', 'prescription', 'medicine', 'treatment', 'diagnosis', 'health', 'patient', 'clinic', 'examination', 'termin', 'symptom', 'rezept', 'medizin', 'behandlung', 'diagnose', 'gesundheit', 'patient', 'klinik', 'untersuchung', 'arzt'],
      housing: ['apartment', 'rent', 'lease', 'landlord', 'tenant', 'deposit', 'utilities', 'furniture', 'neighborhood', 'address', 'wohnung', 'miete', 'mietvertrag', 'vermieter', 'mieter', 'kaution', 'nebenkosten', 'möbel', 'nachbarschaft', 'adresse'],
      government_office: ['termin', 'formular', 'anmeldung', 'bescheinigung', 'unterlagen', 'ausweis', 'amt', 'beamte', 'sachbearbeiter', 'aufenthaltserlaubnis', 'pass', 'bürgeramt', 'ausländeramt', 'jobcenter', 'krankenkasse'],
      casual_greeting: ['greeting', 'hello', 'goodbye', 'morning', 'evening', 'day', 'see', 'meet', 'friend', 'time', 'grüßen', 'hallo', 'auf wiedersehen', 'morgen', 'abend', 'tag', 'sehen', 'treffen', 'freund', 'zeit', 'tschüss']
    };

    const scenarioTokens = SCENARIO_TOKEN_DICTS[template.scenario] || [];
    if (scenarioTokens.length > 0) {
      // Check that requiredScenarioTokens are subset of scenario dictionary
      for (const token of template.requiredScenarioTokens) {
        const tokenLower = token.toLowerCase();
        const found = scenarioTokens.some(st => st.toLowerCase() === tokenLower);
        if (!found) {
          // Warn but don't fail - allows custom tokens
          console.warn(`⚠️  ${templatePath}: requiredScenarioTokens contains "${token}" which is not in scenario "${template.scenario}" dictionary. This is allowed but may cause quality gate failures.`);
        }
      }
    } else {
      console.warn(`⚠️  ${templatePath}: Scenario "${template.scenario}" has no token dictionary defined. Quality gates may skip scenario token validation.`);
    }

  } catch (err: any) {
    addError(templatePath, `Template validation failed: ${err.message}`);
  }
}

function validateManifest(manifestPath: string): void {
  try {
    const content = readFileSync(manifestPath, 'utf-8');
    const manifest = JSON.parse(content);

    // Validate schemaVersion first
    validateSchemaVersion('Manifest', manifest, manifestPath);

    // Validate required fields (schemaVersion validation also checks these, but keep for clarity)
    if (!manifest.activeVersion) {
      addError(manifestPath, 'Missing required field: activeVersion');
    }
    // activeWorkspace is optional (defaults to first workspace if not provided)
    if (!manifest.workspaces || typeof manifest.workspaces !== 'object') {
      addError(manifestPath, 'Missing or invalid field: workspaces (must be an object)');
      return;
    }

    // Validate that referenced catalog paths exist
    for (const [workspaceId, catalogPath] of Object.entries(manifest.workspaces)) {
      if (typeof catalogPath !== 'string') {
        addError(manifestPath, `Workspace "${workspaceId}" catalog path must be a string`);
        continue;
      }

      if (!catalogPath.startsWith('/v1/') || !catalogPath.endsWith('.json')) {
        addError(manifestPath, `Workspace "${workspaceId}" catalog path must start with /v1/ and end with .json`);
        continue;
      }

      // Resolve path relative to content/v1
      const relativePath = catalogPath.replace(/^\/v1\//, '');
      const fullPath = join(CONTENT_DIR, relativePath);

      if (!existsSync(fullPath)) {
        addError(manifestPath, `Workspace "${workspaceId}" catalog path "${catalogPath}" does not exist (resolved to: ${fullPath})`);
      }
    }

    // Validate workspaceHashes if present
    if (manifest.workspaceHashes !== undefined) {
      if (typeof manifest.workspaceHashes !== 'object' || manifest.workspaceHashes === null) {
        addError(manifestPath, 'workspaceHashes must be an object if present');
      } else {
        // Ensure workspaceHashes contains an entry for every workspace
        const workspaceIds = Object.keys(manifest.workspaces);
        const hashWorkspaceIds = Object.keys(manifest.workspaceHashes);

        for (const workspaceId of workspaceIds) {
          if (!hashWorkspaceIds.includes(workspaceId)) {
            addError(manifestPath, `workspaceHashes missing entry for workspace "${workspaceId}"`);
          } else {
            const hash = manifest.workspaceHashes[workspaceId];
            if (typeof hash !== 'string') {
              addError(manifestPath, `workspaceHashes["${workspaceId}"] must be a string`);
            } else if (hash === 'PLACEHOLDER') {
              // This is a warning, not an error - hash will be computed during promotion
              console.warn(`⚠️  ${manifestPath}: workspaceHashes["${workspaceId}"] is PLACEHOLDER - will be computed during promotion`);
            } else if (!/^[a-f0-9]{64}$/.test(hash)) {
              addError(manifestPath, `workspaceHashes["${workspaceId}"] must be a valid SHA256 hex string (64 chars)`);
            }
          }
        }

        // Note: Hash computation verification is done in promote-staging.sh
        // The validator only checks structure and format here
      }
    }

    // Validate minClientVersion if present
    if (manifest.minClientVersion !== undefined) {
      if (typeof manifest.minClientVersion !== 'string') {
        addError(manifestPath, 'minClientVersion must be a string if present');
      } else {
        // Basic semver validation (loose)
        if (!/^\d+\.\d+\.\d+/.test(manifest.minClientVersion)) {
          addError(manifestPath, `minClientVersion "${manifest.minClientVersion}" must be a valid semver string (e.g., "1.0.0")`);
        }
      }
    }
  } catch (err: any) {
    addError(manifestPath, `Failed to parse JSON: ${err.message}`);
  }
}

function main() {
  console.log('Validating content structure...\n');

  if (!existsSync(CONTENT_DIR)) {
    console.error(`❌ Content directory not found: ${CONTENT_DIR}`);
    process.exit(1);
  }

  // Validate manifest.json exists and is valid (production)
  // Note: manifest.json may not exist before first promotion (it's created during promotion)
  const manifestPath = join(META_DIR, 'manifest.json');
  if (!existsSync(manifestPath)) {
    // Only warn, don't error - manifest.json is created during promotion
    console.warn(`⚠️  ${manifestPath}: manifest.json not found (will be created during promotion)`);
  } else {
    validateManifest(manifestPath);
  }

  // Validate manifest.staging.json exists and is valid (staging)
  const stagingManifestPath = join(META_DIR, 'manifest.staging.json');
  if (!existsSync(stagingManifestPath)) {
    addError(stagingManifestPath, 'manifest.staging.json not found in content/meta/');
  } else {
    validateManifest(stagingManifestPath);
  }

  // Validate release.json exists
  const releasePath = join(META_DIR, 'release.json');
  if (!existsSync(releasePath)) {
    addError(releasePath, 'release.json not found in content/meta/');
  } else {
    validateJsonFile(releasePath);
  }

  // Find all JSON files
  const jsonFiles = findJsonFiles(CONTENT_DIR);

  if (jsonFiles.length === 0) {
    console.error('❌ No JSON files found in content/v1/');
    process.exit(1);
  }

  // Validate all JSON files parse correctly
  jsonFiles.forEach(file => {
    validateJsonFile(file);
  });

  // Validate template files
  const templateFiles = jsonFiles.filter(file => {
    const relPath = relative(CONTENT_DIR, file);
    return relPath.includes('workspaces/') && relPath.includes('/templates/') && file.endsWith('.json');
  });

  templateFiles.forEach(file => {
    validateTemplate(file);
  });

  // Validate bundle definitions
  const bundlesDir = join(META_DIR, 'bundles');
  if (existsSync(bundlesDir)) {
    const bundleFiles = readdirSync(bundlesDir)
      .filter(file => file.endsWith('.json'))
      .map(file => join(bundlesDir, file));

    bundleFiles.forEach(bundlePath => {
      try {
        const bundle = JSON.parse(readFileSync(bundlePath, 'utf-8'));

        // Validate schema
        if (bundle.version !== 1) {
          addError(bundlePath, `Bundle version must be 1 (got ${bundle.version})`);
        }
        if (!bundle.id || typeof bundle.id !== 'string') {
          addError(bundlePath, 'Bundle missing or invalid id field');
        }
        if (!bundle.workspace || typeof bundle.workspace !== 'string') {
          addError(bundlePath, 'Bundle missing or invalid workspace field');
        }
        if (!bundle.title || typeof bundle.title !== 'string') {
          addError(bundlePath, 'Bundle missing or invalid title field');
        }
        if (!bundle.filters || typeof bundle.filters !== 'object') {
          addError(bundlePath, 'Bundle missing or invalid filters field');
        }
        if (!Array.isArray(bundle.includeKinds) || bundle.includeKinds.length === 0) {
          addError(bundlePath, 'Bundle missing or invalid includeKinds field (must be non-empty array)');
        }
        if (!bundle.ordering || typeof bundle.ordering !== 'object') {
          addError(bundlePath, 'Bundle missing or invalid ordering field');
        } else {
          if (!Array.isArray(bundle.ordering.by) || bundle.ordering.by.length === 0) {
            addError(bundlePath, 'Bundle ordering.by must be non-empty array');
          }
          if (bundle.ordering.stable !== true) {
            addError(bundlePath, 'Bundle ordering.stable must be true (deterministic ordering required)');
          }
        }

        // Validate workspace exists
        const workspacePath = join(CONTENT_DIR, 'workspaces', bundle.workspace);
        if (!existsSync(workspacePath)) {
          addError(bundlePath, `Bundle workspace "${bundle.workspace}" does not exist`);
        }
      } catch (err: any) {
        addError(bundlePath, `Failed to parse bundle: ${err.message}`);
      }
    });
  }

  // Validate index files (index.json under workspaces)
  const indexFiles = jsonFiles.filter(file => {
    const relPath = relative(CONTENT_DIR, file);
    return relPath.includes('workspaces/') && file.endsWith('index.json');
  });

  indexFiles.forEach(file => {
    validateIndex(file);
  });

  // Validate scenario index files (context/scenarios.json)
  const scenarioIndexFiles = jsonFiles.filter(file => {
    const relPath = relative(CONTENT_DIR, file);
    return relPath.includes('workspaces/') && relPath.includes('context/scenarios.json');
  });

  scenarioIndexFiles.forEach(file => {
    validateScenarioIndex(file);
  });

  // Find and validate workspace catalogs
  const workspacesDir = join(CONTENT_DIR, 'workspaces');
  if (!existsSync(workspacesDir)) {
    addError(workspacesDir, 'workspaces directory not found');
  } else {
    const workspaces = readdirSync(workspacesDir).filter(item => {
      const itemPath = join(workspacesDir, item);
      return statSync(itemPath).isDirectory();
    });

    if (workspaces.length === 0) {
      addError(workspacesDir, 'No workspace directories found');
    } else {
      // Validate each workspace catalog
      workspaces.forEach(workspace => {
        const catalogPath = join(workspacesDir, workspace, 'catalog.json');
        if (!existsSync(catalogPath)) {
          // Skip test workspaces - they may not have catalogs
          if (workspace === 'test-ws') {
            console.warn(`⚠️  ${catalogPath}: test workspace missing catalog.json (skipping)`);
          } else {
            addError(catalogPath, `Workspace "${workspace}" missing catalog.json`);
          }
        } else {
          validateCatalog(catalogPath);
        }

        // Validate featured.json if it exists
        const featuredPath = join(workspacesDir, workspace, 'featured', 'featured.json');
        if (existsSync(featuredPath)) {
          validateFeatured(featuredPath);
        }
      });
    }
  }

  // Report results
  if (errors.length > 0) {
    console.error('❌ Validation errors:\n');
    errors.forEach(err => {
      const relPath = relative(process.cwd(), err.file);
      console.error(`   ${relPath}: ${err.message}`);
    });
    console.error(`\n❌ Validation failed with ${errors.length} error(s)`);
    process.exit(1);
  }

  console.log('✅ All content files are valid!');
  console.log(`   Validated ${jsonFiles.length} JSON file(s)`);
  if (indexFiles.length > 0) {
    console.log(`   Validated ${indexFiles.length} index file(s) with pagination schema`);
  }
}

main();

