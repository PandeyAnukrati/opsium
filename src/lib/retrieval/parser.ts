/* eslint-disable */
import type { Chunk } from '../db/mockDb';

// Common English stop words to filter out from keywords
const STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'arent',
  'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by',
  'can', 'cant', 'cannot', 'could', 'couldnt', 'did', 'didnt', 'do', 'does', 'doesnt', 'doing', 'dont',
  'down', 'during', 'each', 'few', 'for', 'from', 'further', 'had', 'hadnt', 'has', 'hasnt', 'have',
  'havent', 'having', 'he', 'hed', 'hell', 'hes', 'her', 'here', 'heres', 'hers', 'herself', 'him',
  'himself', 'his', 'how', 'hows', 'i', 'id', 'ill', 'im', 'ive', 'if', 'in', 'into', 'is', 'isnt',
  'it', 'its', 'itself', 'lets', 'me', 'more', 'most', 'mustnt', 'my', 'myself', 'no', 'nor', 'not',
  'of', 'off', 'on', 'once', 'only', 'or', 'other', 'ought', 'our', 'ours', 'ourselves', 'out',
  'over', 'own', 'same', 'shant', 'she', 'shed', 'shell', 'shes', 'should', 'shouldnt', 'so', 'some',
  'such', 'than', 'that', 'thats', 'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there',
  'theres', 'these', 'they', 'theyd', 'theyll', 'theyre', 'theyve', 'this', 'those', 'through', 'to',
  'too', 'under', 'until', 'up', 'very', 'was', 'wasnt', 'we', 'wed', 'well', 'were', 'weve', 'werent',
  'what', 'whats', 'when', 'whens', 'where', 'wheres', 'which', 'while', 'who', 'whos', 'whom', 'why',
  'whys', 'with', 'wont', 'would', 'wouldnt', 'you', 'youd', 'youll', 'youre', 'youve', 'your',
  'yours', 'yourself', 'yourselves', 'get', 'set', 'got', 'run', 'has', 'had', 'having'
]);

export function extractKeywords(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9#_\-]/g, ' ') // Keep tags, numbers, hyphens
    .split(/\s+/)
    .filter(word => word.length > 2 && !STOP_WORDS.has(word));
  return Array.from(new Set(words));
}

// Regex to find timestamps: HH:mm:ss, YYYY-MM-DD HH:mm:ss, or HH:mm
const TIMESTAMP_REGEX = /(?:(?:[0-9]{4}-[0-9]{2}-[0-9]{2}\s+)?[0-9]{2}:[0-9]{2}:[0-9]{2})|(?:\b[0-9]{2}:[0-9]{2}\b)/;

function extractTimestamp(text: string): string {
  const match = text.match(TIMESTAMP_REGEX);
  if (match) {
    return match[0];
  }
  // Default to a timestamp representation or current time
  const now = new Date();
  return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
}

export function parseFileContent(
  fileName: string,
  content: string,
  incidentId: string
): Omit<Chunk, 'id'>[] {
  const fileType = fileName.split('.').pop()?.toLowerCase() || 'txt';
  const chunks: Omit<Chunk, 'id'>[] = [];
  const source = fileType === 'json' && content.includes('slack') ? 'slack' : fileType;

  if (fileType === 'json') {
    try {
      const data = JSON.parse(content);
      if (Array.isArray(data)) {
        // Assume array of objects (like Slack messages, Jira logs, or JSON logs)
        data.forEach((item, index) => {
          const itemStr = typeof item === 'object' ? JSON.stringify(item) : String(item);
          const time = item.timestamp || item.time || item.created || extractTimestamp(itemStr);
          const body = item.text || item.message || item.content || item.description || itemStr;
          const author = item.user || item.username || item.author || 'unknown';

          chunks.push({
            incidentId,
            source: source === 'slack' || item.channel ? 'slack' : 'json',
            timestamp: time,
            content: body,
            keywords: extractKeywords(body + ' ' + author),
            metadata: {
              fileName,
              index,
              ...item
            }
          });
        });
        return chunks;
      } else if (typeof data === 'object') {
        // Nested object. Let's see if there are key collections
        if (data.messages && Array.isArray(data.messages)) {
          // Slack channel export format
          data.messages.forEach((msg: any) => {
            const time = msg.ts ? new Date(parseFloat(msg.ts) * 1000).toLocaleTimeString() : extractTimestamp(msg.text || '');
            chunks.push({
              incidentId,
              source: 'slack',
              timestamp: time,
              content: msg.text || '',
              keywords: extractKeywords((msg.text || '') + ' ' + (msg.user || '')),
              metadata: { fileName, user: msg.user, ...msg }
            });
          });
          return chunks;
        }
        // Generic object, treat as single chunk
        const body = JSON.stringify(data, null, 2);
        chunks.push({
          incidentId,
          source: 'json',
          timestamp: extractTimestamp(body),
          content: body,
          keywords: extractKeywords(body),
          metadata: { fileName }
        });
        return chunks;
      }
    } catch {
      // Fallback to text parsing if JSON parsing fails
    }
  }

  if (fileType === 'csv') {
    const lines = content.split('\n').filter(l => l.trim().length > 0);
    const header = lines[0]?.split(',').map(h => h.trim().replace(/^["']|["']$/g, '')) || [];
    
    for (let i = 1; i < lines.length; i++) {
      const row = lines[i].split(',').map(r => r.trim().replace(/^["']|["']$/g, ''));
      if (row.length === 0 || row.join('').trim().length === 0) continue;
      
      const item: Record<string, string> = {};
      header.forEach((h, idx) => {
        item[h || `col_${idx}`] = row[idx] || '';
      });

      const text = row.join(' | ');
      const time = item.timestamp || item.time || item.Time || item.Date || extractTimestamp(text);

      chunks.push({
        incidentId,
        source: 'csv',
        timestamp: time,
        content: text,
        keywords: extractKeywords(text),
        metadata: { fileName, row: i, data: item }
      });
    }
    return chunks;
  }

  // LOG and TXT file parsing (default)
  // We chunk by lines or blocks. If a line starts with a timestamp or is long, it's a chunk.
  // Group log blocks together (e.g. stack traces) if they don't have new timestamps.
  const lines = content.split('\n');
  let currentChunk: Omit<Chunk, 'id'> | null = null;

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (trimmed.length === 0) return;

    const hasTime = TIMESTAMP_REGEX.test(line);

    if (hasTime || !currentChunk) {
      if (currentChunk) {
        chunks.push(currentChunk);
      }
      const timestamp = extractTimestamp(line);
      
      // Determine probable source
      let sourceTag = 'log';
      if (fileName.toLowerCase().includes('slack')) sourceTag = 'slack';
      else if (fileName.toLowerCase().includes('jira')) sourceTag = 'jira';
      else if (fileName.toLowerCase().includes('email')) sourceTag = 'email';

      currentChunk = {
        incidentId,
        source: sourceTag,
        timestamp,
        content: trimmed,
        keywords: extractKeywords(trimmed),
        metadata: { fileName, startLine: idx + 1 }
      };
    } else {
      // Append stack trace or log body to previous chunk
      currentChunk.content += '\n' + trimmed;
      currentChunk.keywords = Array.from(
        new Set([...currentChunk.keywords, ...extractKeywords(trimmed)])
      );
    }
  });

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  // Post-process: limit log chunk size to prevent database bloated nodes
  return chunks;
}
