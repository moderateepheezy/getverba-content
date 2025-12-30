/**
 * Text extraction from PDF, URL, or raw text
 */

import { readFileSync } from 'fs';
import { createHash } from 'crypto';
import type { InputSource } from './ingestTypes.js';

/**
 * Extract text from PDF using pdf-parse
 */
async function extractFromPDF(filePath: string): Promise<string> {
  try {
    // Dynamic import to handle optional dependency
    const pdfParse = await import('pdf-parse');
    const dataBuffer = readFileSync(filePath);
    const data = await pdfParse.default(dataBuffer);
    return data.text;
  } catch (error) {
    if ((error as any).code === 'MODULE_NOT_FOUND') {
      throw new Error(
        'pdf-parse is not installed. Install it with: npm install --save-dev pdf-parse'
      );
    }
    throw error;
  }
}

/**
 * Extract text from URL (HTML)
 */
async function extractFromURL(url: string): Promise<string> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
    }
    const html = await response.text();
    
    // Use node-html-parser if available, otherwise basic tag stripping
    try {
      const { parse } = await import('node-html-parser');
      const root = parse(html);
      // Remove script and style tags
      root.querySelectorAll('script, style').forEach(el => el.remove());
      return root.textContent || '';
    } catch (e) {
      // Fallback: basic HTML tag stripping
      return html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('fetch')) {
      throw new Error(
        'fetch is not available. This script requires Node.js 18+ or a fetch polyfill.'
      );
    }
    throw error;
  }
}

/**
 * Extract text from raw text input
 */
function extractFromText(text: string): string {
  return text.trim();
}

/**
 * Main extraction function
 */
export async function extractText(
  source: InputSource,
  inputPath?: string,
  inputText?: string,
  inputUrl?: string
): Promise<string> {
  switch (source) {
    case 'pdf':
      if (!inputPath) {
        throw new Error('PDF source requires inputPath');
      }
      return await extractFromPDF(inputPath);
    
    case 'url':
      if (!inputUrl) {
        throw new Error('URL source requires inputUrl');
      }
      return await extractFromURL(inputUrl);
    
    case 'text':
      if (!inputText) {
        throw new Error('Text source requires inputText');
      }
      return extractFromText(inputText);
    
    default:
      throw new Error(`Unknown source type: ${source}`);
  }
}

/**
 * Normalize text for processing
 */
export function normalizeText(text: string): string {
  return text
    .replace(/\s+/g, ' ') // Normalize whitespace
    .replace(/[\r\n]+/g, ' ') // Replace line breaks with space
    .trim();
}

