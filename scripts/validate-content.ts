#!/usr/bin/env tsx

import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, dirname, relative } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONTENT_DIR = join(__dirname, '..', 'content', 'v1');
const META_DIR = join(__dirname, '..', 'content', 'meta');

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
              const verbPatterns = /\b(gehen|kommen|sein|haben|werden|machen|sagen|geben|sehen|wissen|können|müssen|sollen|dürfen|wollen|mögen|sein|haben|ist|sind|war|waren|hat|haben|wird|werden|macht|machen|sagt|sagen|geht|gehen|kommt|kommen|gibt|geben|sieht|sehen|weiß|wissen|kann|können|muss|müssen|soll|sollen|darf|dürfen|will|wollen|mag|mögen)\b/i;
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
  // 1. Validate intent (required)
  if (!prompt.intent || typeof prompt.intent !== 'string') {
    addError(contextFile, `Item ${itemIdx} pack entry prompt ${pIdx} missing or invalid field: intent (required, must be one of: ${VALID_INTENTS.join(', ')})`);
  } else if (!VALID_INTENTS.includes(prompt.intent)) {
    addError(contextFile, `Item ${itemIdx} pack entry prompt ${pIdx} invalid intent "${prompt.intent}". Must be one of: ${VALID_INTENTS.join(', ')}`);
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
  
  // Validate cognitiveLoad enum
  const validCognitiveLoads = ['low', 'medium', 'high'];
  if (!analytics.cognitiveLoad || typeof analytics.cognitiveLoad !== 'string') {
    addError(contextFile, `Item ${itemIdx} pack entry analytics.cognitiveLoad missing or invalid (must be one of: ${validCognitiveLoads.join(', ')})`);
  } else if (!validCognitiveLoads.includes(analytics.cognitiveLoad)) {
    addError(contextFile, `Item ${itemIdx} pack entry analytics.cognitiveLoad "${analytics.cognitiveLoad}" is invalid. Must be one of: ${validCognitiveLoads.join(', ')}`);
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
  
  // Quality Gates v2: Near-duplicate detection
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
    casual_greeting: ['greeting', 'hello', 'goodbye', 'morning', 'evening', 'day', 'see', 'meet', 'friend', 'time', 'grüßen', 'hallo', 'auf wiedersehen', 'morgen', 'abend', 'tag', 'sehen', 'treffen', 'freund', 'zeit', 'tschüss']
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

function validateIndex(indexPath: string): void {
  try {
    const content = readFileSync(indexPath, 'utf-8');
    const index = JSON.parse(content);

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
    if (typeof index.pageSize !== 'number') {
      addError(indexPath, 'Missing or invalid field: pageSize (must be number)');
    }
    if (!Array.isArray(index.items)) {
      addError(indexPath, 'Missing or invalid field: items (must be an array)');
      return;
    }

    // Validate nextPage
    if (index.nextPage !== null && typeof index.nextPage !== 'string') {
      addError(indexPath, 'Invalid field: nextPage (must be null or string)');
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
        const validKinds = ['pack', 'exam', 'drill'];
        if (!validKinds.includes(item.kind.toLowerCase())) {
          addError(indexPath, `Item ${idx} kind must be one of: "pack", "exam", "drill"`);
        }
      }
      if (!item.title || typeof item.title !== 'string') {
        addError(indexPath, `Item ${idx} missing or invalid field: title (must be string)`);
      } else {
        // Validate title length
        validateTitle(item.title, indexPath, idx);
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
            validateEntryDocument(entryPath, item.kind, indexPath, idx);
            
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
      // durationMinutes - validate type and bounds
      if (item.durationMinutes !== undefined) {
        if (typeof item.durationMinutes !== 'number') {
          addError(indexPath, `Item ${idx} durationMinutes must be a number if present`);
        } else {
          validateDuration(item.durationMinutes, indexPath, idx, 'durationMinutes');
        }
      }
    });

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
  const manifestPath = join(META_DIR, 'manifest.json');
  if (!existsSync(manifestPath)) {
    addError(manifestPath, 'manifest.json not found in content/meta/');
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
          addError(catalogPath, `Workspace "${workspace}" missing catalog.json`);
        } else {
          validateCatalog(catalogPath);
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

