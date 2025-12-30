/**
 * Window Search
 * 
 * Finds the best contiguous page window for a scenario.
 */

import type { PageText } from './extract.js';
import type { Candidate } from './segment.js';
import type { ScoreBreakdown } from './scenarioScore.js';
import { scoreCandidate } from './scenarioScore.js';

export interface Window {
  startPage: number;
  endPage: number;
  pageIndices: number[];
  candidateCount: number;
  qualifiedCandidates: number;
  totalTokenHits: number;
  anchorHits: number;
  averageScore: number;
  candidates: Array<Candidate & { score: ScoreBreakdown; pageIndex: number }>;
}

export interface WindowSearchResult {
  bestWindow: Window | null;
  topWindows: Window[];
  allWindows: Window[];
}

/**
 * Find best window for scenario
 */
export function findBestWindow(
  pages: PageText[],
  candidates: Array<Candidate & { pageIndex: number }>,
  scenarioTokens: string[],
  anchors: string[],
  windowSizePages: number,
  minScenarioHits: number,
  language: 'de' | 'en',
  topN: number = 3,
  strongTokens?: string[]
): WindowSearchResult {
  const windows: Window[] = [];
  
  // Create sliding windows
  for (let start = 0; start <= pages.length - windowSizePages; start++) {
    const end = start + windowSizePages - 1;
    const pageIndices = Array.from({ length: windowSizePages }, (_, i) => start + i);
    
    // Get candidates in this window
    const windowCandidates = candidates
      .filter(c => c.pageIndex >= start && c.pageIndex <= end)
      .map(c => {
        const score = scoreCandidate(c, scenarioTokens, language, minScenarioHits, strongTokens);
        return { ...c, score };
      });
    
    // Count qualified candidates (with >= minScenarioHits OR 1 hit with strong token)
    const qualifiedCandidates = windowCandidates.filter(
      c => c.score.scenarioTokenHits >= minScenarioHits ||
           (c.score.scenarioTokenHits >= 1 && c.score.strongTokenHits > 0)
    ).length;
    
    // Count total token hits
    const totalTokenHits = windowCandidates.reduce(
      (sum, c) => sum + c.score.scenarioTokenHits,
      0
    );
    
    // Count anchor hits
    let anchorHits = 0;
    if (anchors.length > 0) {
      const windowText = windowCandidates.map(c => c.text).join(' ').toLowerCase();
      for (const anchor of anchors) {
        if (windowText.includes(anchor.toLowerCase())) {
          anchorHits++;
        }
      }
    }
    
    // Calculate average score
    const averageScore = windowCandidates.length > 0
      ? windowCandidates.reduce((sum, c) => sum + c.score.totalScore, 0) / windowCandidates.length
      : 0;
    
    windows.push({
      startPage: start + 1, // 1-indexed for display
      endPage: end + 1,
      pageIndices,
      candidateCount: windowCandidates.length,
      qualifiedCandidates,
      totalTokenHits,
      anchorHits,
      averageScore,
      candidates: windowCandidates
    });
  }
  
  // Sort windows by:
  // 1. Anchor hits (if anchors provided)
  // 2. Qualified candidates count
  // 3. Total token hits
  // 4. Average score
  windows.sort((a, b) => {
    if (anchors.length > 0) {
      if (a.anchorHits !== b.anchorHits) {
        return b.anchorHits - a.anchorHits;
      }
    }
    if (a.qualifiedCandidates !== b.qualifiedCandidates) {
      return b.qualifiedCandidates - a.qualifiedCandidates;
    }
    if (a.totalTokenHits !== b.totalTokenHits) {
      return b.totalTokenHits - a.totalTokenHits;
    }
    return b.averageScore - a.averageScore;
  });
  
  const bestWindow = windows.length > 0 ? windows[0] : null;
  const topWindows = windows.slice(0, topN);
  
  return {
    bestWindow,
    topWindows,
    allWindows: windows
  };
}

