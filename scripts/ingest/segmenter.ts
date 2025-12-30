/**
 * Deterministic text segmentation into chunks
 */

import { createHash } from 'crypto';
import type { TextChunk } from './ingestTypes.js';
import { normalizeText } from './extractText.js';

/**
 * Generate stable chunk ID from normalized text
 */
function generateChunkId(normalizedText: string): string {
  const hash = createHash('sha1');
  hash.update(normalizedText);
  return hash.digest('hex').slice(0, 10);
}

/**
 * Split text into chunks based on headings, bullets, and max length
 */
export function segmentText(text: string, maxChunkLength: number = 500): TextChunk[] {
  const chunks: TextChunk[] = [];
  const normalized = normalizeText(text);
  
  // Split by headings (lines starting with #, or all caps lines)
  const headingPattern = /^#{1,6}\s+.+$/gm;
  const allCapsPattern = /^[A-ZÄÖÜ][A-ZÄÖÜ\s]{10,}$/gm;
  
  // Also split by bullet points
  const bulletPattern = /^[\s]*[-•*]\s+/gm;
  
  // Combine all split patterns
  const splitPoints: number[] = [0];
  
  // Find heading split points
  let match;
  while ((match = headingPattern.exec(normalized)) !== null) {
    splitPoints.push(match.index);
  }
  
  // Find all-caps split points
  while ((match = allCapsPattern.exec(normalized)) !== null) {
    if (!splitPoints.includes(match.index)) {
      splitPoints.push(match.index);
    }
  }
  
  // Find bullet split points
  while ((match = bulletPattern.exec(normalized)) !== null) {
    if (!splitPoints.includes(match.index)) {
      splitPoints.push(match.index);
    }
  }
  
  // Sort split points
  splitPoints.sort((a, b) => a - b);
  
  // If no split points found, split by paragraphs (double newline)
  if (splitPoints.length === 1) {
    const paragraphs = normalized.split(/\n\n+/);
    let currentPos = 0;
    for (const para of paragraphs) {
      if (para.trim().length > 0) {
        splitPoints.push(currentPos);
        currentPos += para.length + 2; // +2 for \n\n
      }
    }
    splitPoints.sort((a, b) => a - b);
  }
  
  // Create chunks from split points
  for (let i = 0; i < splitPoints.length; i++) {
    const start = splitPoints[i];
    const end = i < splitPoints.length - 1 ? splitPoints[i + 1] : normalized.length;
    let chunkText = normalized.slice(start, end).trim();
    
    // If chunk is too long, split it further
    if (chunkText.length > maxChunkLength) {
      const subChunks = splitLongChunk(chunkText, maxChunkLength);
      for (const subChunk of subChunks) {
        const normalizedChunk = normalizeText(subChunk);
        if (normalizedChunk.length > 20) { // Minimum chunk size
          const chunkId = generateChunkId(normalizedChunk);
          chunks.push({
            chunkId,
            text: subChunk,
            normalizedText: normalizedChunk,
            charStart: start,
            charEnd: start + subChunk.length
          });
        }
      }
    } else {
      if (chunkText.length > 20) { // Minimum chunk size
        const normalizedChunk = normalizeText(chunkText);
        const chunkId = generateChunkId(normalizedChunk);
        chunks.push({
          chunkId,
          text: chunkText,
          normalizedText: normalizedChunk,
          charStart: start,
          charEnd: end
        });
      }
    }
  }
  
  return chunks;
}

/**
 * Split a long chunk into smaller chunks
 */
function splitLongChunk(text: string, maxLength: number): string[] {
  const chunks: string[] = [];
  const sentences = text.split(/[.!?]+\s+/);
  
  let currentChunk = '';
  for (const sentence of sentences) {
    if (currentChunk.length + sentence.length > maxLength && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = sentence;
    } else {
      currentChunk += (currentChunk ? '. ' : '') + sentence;
    }
  }
  
  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }
  
  // If still too long, split by commas
  const finalChunks: string[] = [];
  for (const chunk of chunks) {
    if (chunk.length > maxLength) {
      const commaSplit = chunk.split(/,\s+/);
      let current = '';
      for (const part of commaSplit) {
        if (current.length + part.length > maxLength && current.length > 0) {
          finalChunks.push(current.trim());
          current = part;
        } else {
          current += (current ? ', ' : '') + part;
        }
      }
      if (current.trim().length > 0) {
        finalChunks.push(current.trim());
      }
    } else {
      finalChunks.push(chunk);
    }
  }
  
  return finalChunks;
}

