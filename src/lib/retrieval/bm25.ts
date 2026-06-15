import type { Chunk } from '../db/mockDb';
import { extractKeywords } from './parser';

export interface ScoreExplanation {
  term: string;
  tf: number;
  idf: number;
  lengthPenalty: number;
  score: number;
}

export interface SearchResult {
  chunk: Chunk;
  score: number;
  explanations: ScoreExplanation[];
  metadataBoost: number;
}

/**
 * Client-side BM25 & TF-IDF Retrieval Scorer
 */
export function rankChunks(
  chunks: Chunk[],
  queryText: string,
  k1: number = 1.5,
  b: number = 0.75
): SearchResult[] {
  if (chunks.length === 0 || !queryText.trim()) {
    return chunks.map(chunk => ({
      chunk,
      score: 0,
      explanations: [],
      metadataBoost: 0
    }));
  }

  // Tokenize query
  const queryTerms = extractKeywords(queryText);
  if (queryTerms.length === 0) {
    // If extraction filtered everything out, use raw words
    queryTerms.push(...queryText.toLowerCase().split(/\s+/).filter(t => t.length > 0));
  }

  const N = chunks.length;

  // Compute lengths and vocabulary
  const docLengths = chunks.map(c => c.content.split(/\s+/).length);
  const avgDL = docLengths.reduce((sum, len) => sum + len, 0) / N;

  // Calculate Document Frequency (DF) for each query term
  const df: Record<string, number> = {};
  queryTerms.forEach(term => {
    df[term] = chunks.filter(c => {
      const contentLower = c.content.toLowerCase();
      return contentLower.includes(term) || c.keywords.includes(term);
    }).length;
  });

  // Calculate IDF for each query term
  const idf: Record<string, number> = {};
  queryTerms.forEach(term => {
    const docFreq = df[term] || 0;
    // Standard Lucene BM25 IDF formulation
    idf[term] = Math.log(1 + (N - docFreq + 0.5) / (docFreq + 0.5));
  });

  const results: SearchResult[] = chunks.map((chunk, idx) => {
    const contentLower = chunk.content.toLowerCase();
    const docLen = docLengths[idx];
    const explanations: ScoreExplanation[] = [];
    let bm25Score = 0;

    queryTerms.forEach(term => {
      // Calculate Term Frequency (TF)
      // Count occurrences in content and give extra weight if it matches a keyword
      const words = contentLower.split(/\s+/);
      let tf = words.filter(w => w.includes(term)).length;
      if (chunk.keywords.includes(term)) {
        tf += 2; // Keyword bonus
      }

      if (tf > 0) {
        const termIdf = idf[term] || 0;
        const lengthPenalty = 1.0 - b + b * (docLen / avgDL);
        const numerator = tf * (k1 + 1);
        const denominator = tf + k1 * lengthPenalty;
        const termScore = termIdf * (numerator / denominator);

        bm25Score += termScore;
        explanations.push({
          term,
          tf,
          idf: termIdf,
          lengthPenalty,
          score: termScore
        });
      }
    });

    // Metadata boosts
    let metadataBoost = 1.0;
    
    // 1. Severity/Error boost: Chunks containing critical words (error, fatal, critical, exception, timeout, fail) get a boost
    const errorPattern = /\b(error|fatal|fail|critical|exception|timeout|exhausted|502|504|500|failed)\b/i;
    if (errorPattern.test(chunk.content)) {
      metadataBoost += 0.3; // 30% boost
    }

    // 2. Freshness boost / Timestamp ordering
    // In SRE incidents, newer logs or logs in specific windows are more relevant, 
    // but here we just apply generic boost. We can also boost based on source (e.g. slack/log)
    if (chunk.source === 'log' || chunk.source === 'slack') {
      metadataBoost += 0.1; // Slight preference for direct log streams and team conversations
    }

    const finalScore = bm25Score * metadataBoost;

    return {
      chunk,
      score: Number(finalScore.toFixed(4)),
      explanations,
      metadataBoost: Number((metadataBoost - 1.0).toFixed(2))
    };
  });

  // Sort by score descending
  return results.sort((a, b) => b.score - a.score);
}

/**
 * Expand query keywords for broader search coverage
 * e.g., "checkout timeout" -> ["checkout", "timeout", "payment", "pool", "latency"]
 */
export function expandKeywords(queryText: string): string {
  const terms = extractKeywords(queryText);
  const expansions: Record<string, string[]> = {
    checkout: ['payment', 'cart', 'buy', 'transaction', 'order'],
    timeout: ['latency', 'slow', 'delay', 'exhausted', 'hang', 'gateway', '504', '502'],
    database: ['db', 'postgres', 'mysql', 'redis', 'connection', 'pool', 'query', 'sql'],
    network: ['routing', 'dns', 'cdn', 'cloudflare', 'gateway', 'proxy', 'nginx'],
    auth: ['login', 'token', 'jwt', 'session', 'cookie', 'credentials', 'redis', 'secret'],
    cpu: ['memory', 'load', 'ram', 'spike', 'throttled', 'oom', 'leak']
  };

  const expanded = [...terms];
  terms.forEach(term => {
    if (expansions[term]) {
      expanded.push(...expansions[term]);
    }
  });

  return Array.from(new Set(expanded)).join(' ');
}
