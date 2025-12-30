/**
 * Scenario Discovery
 * 
 * Discovers which scenarios are present in a PDF by analyzing candidate tokens.
 */

import type { Candidate } from './segment.js';
import { scoreCandidate } from './scenarioScore.js';
import { findBestWindow } from './windowSearch.js';
import type { PageText } from './extract.js';

export interface ScenarioStats {
  scenario: string;
  totalTokenHits: number;
  candidatesWithAnyHit: number;
  candidatesWithMinHits: number;
  topMatchedTokens: Array<{ token: string; count: number }>;
  bestWindow?: {
    startPage: number;
    endPage: number;
    qualifiedCandidates: number;
    totalTokenHits: number;
  };
}

export interface ScenarioDiscoveryResult {
  scenarios: ScenarioStats[];
  rankedScenarios: string[]; // Top scenarios by total token hits
  recommendedScenarios: string[]; // Top 3 scenarios
}

/**
 * Discover scenarios present in candidates
 */
export function discoverScenarios(
  pages: PageText[],
  candidates: Array<Candidate & { pageIndex: number }>,
  scenarioDictionaries: Record<string, string[]>,
  strongTokens: Record<string, string[]>,
  language: 'de' | 'en',
  minScenarioHits: number = 2,
  windowSizePages: number = 25
): ScenarioDiscoveryResult {
  const scenarioStats: ScenarioStats[] = [];
  
  // Analyze each scenario
  for (const [scenario, tokens] of Object.entries(scenarioDictionaries)) {
    const strong = strongTokens[scenario] || [];
    
    // Score all candidates for this scenario
    const scoredCandidates = candidates.map(c => {
      const score = scoreCandidate(c, tokens, language, minScenarioHits, strong);
      return { ...c, score };
    });
    
    // Count stats
    const candidatesWithAnyHit = scoredCandidates.filter(c => c.score.scenarioTokenHits > 0).length;
    const candidatesWithMinHits = scoredCandidates.filter(
      c => c.score.scenarioTokenHits >= minScenarioHits || 
           (c.score.scenarioTokenHits >= 1 && c.score.strongTokenHits > 0)
    ).length;
    
    const totalTokenHits = scoredCandidates.reduce((sum, c) => sum + c.score.scenarioTokenHits, 0);
    
    // Count token frequencies
    const tokenCounts = new Map<string, number>();
    for (const candidate of scoredCandidates) {
      for (const token of candidate.score.matchedTokens) {
        tokenCounts.set(token, (tokenCounts.get(token) || 0) + 1);
      }
    }
    
    const topMatchedTokens = Array.from(tokenCounts.entries())
      .map(([token, count]) => ({ token, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
    
    // Find best window for this scenario
    let bestWindow: ScenarioStats['bestWindow'] | undefined;
    if (candidates.length > 0 && pages.length > 0) {
      try {
        const strong = strongTokens[scenario] || [];
        const windowResult = findBestWindow(
          pages,
          candidates,
          tokens,
          [], // No anchors for discovery
          windowSizePages,
          minScenarioHits,
          language,
          1, // Just get best window
          strong
        );
        
        if (windowResult.bestWindow) {
          bestWindow = {
            startPage: windowResult.bestWindow.startPage,
            endPage: windowResult.bestWindow.endPage,
            qualifiedCandidates: windowResult.bestWindow.qualifiedCandidates,
            totalTokenHits: windowResult.bestWindow.totalTokenHits
          };
        }
      } catch (error) {
        // Window search might fail if no candidates, skip
      }
    }
    
    scenarioStats.push({
      scenario,
      totalTokenHits,
      candidatesWithAnyHit,
      candidatesWithMinHits,
      topMatchedTokens,
      bestWindow
    });
  }
  
  // Rank scenarios by total token hits
  const rankedScenarios = scenarioStats
    .sort((a, b) => b.totalTokenHits - a.totalTokenHits)
    .map(s => s.scenario);
  
  // Recommend top 3 scenarios (excluding those with very low hits)
  const recommendedScenarios = scenarioStats
    .filter(s => s.totalTokenHits > 0 && s.candidatesWithMinHits >= 5)
    .sort((a, b) => b.totalTokenHits - a.totalTokenHits)
    .slice(0, 3)
    .map(s => s.scenario);
  
  return {
    scenarios: scenarioStats,
    rankedScenarios,
    recommendedScenarios
  };
}

