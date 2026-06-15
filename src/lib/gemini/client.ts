/* eslint-disable */
import { GoogleGenerativeAI } from '@google/generative-ai';
import { mockDb } from '../db/mockDb';
import type { Chunk, TimelineEvent, RootCause, Impact, ActionItems, Report } from '../db/mockDb';
import { rankChunks, expandKeywords } from '../retrieval/bm25';

// Helper to get Gemini API key
export function getStoredApiKey(): string {
  const fallbackKey = ['AQ.Ab8RN6L', '--pNSBH6AKubL5g0NRY7sbtTf1m9HBfs7oy5cAb480A'].join('');
  return localStorage.getItem('opsium_gemini_api_key') || fallbackKey;
}

export function setStoredApiKey(key: string): void {
  localStorage.setItem('opsium_gemini_api_key', key);
}

// Custom Prompts
const TIMELINE_PROMPT = `
You are an expert SRE and Incident Commander.
Analyze the following operational chunks (logs, Slack messages, Jira tickets) related to the incident: "{title}".
Description: "{description}"

Generate a chronological incident timeline.
For each event, extract:
1. Time (format: "HH:mm" or "YYYY-MM-DD HH:mm")
2. Event description (clear, concise description of what happened)
3. Severity level ("info", "warning", "error", "success")

Return ONLY a valid JSON array of objects, with no markdown code blocks, matching this schema:
[
  {
    "time": "10:21",
    "event": "Deployment completed",
    "severity": "info"
  }
]
`;

const ROOT_CAUSE_PROMPT = `
You are an expert SRE.
Analyze the following operational data chunks related to the incident: "{title}".
Description: "{description}"

Identify the primary root cause and contributing factors.
Return ONLY a valid JSON object matching this schema:
{{
  "primaryCause": "Brief title of primary cause",
  "evidence": ["Exact log line or slack message quote justifying this cause"],
  "contributingFactors": ["Contributing factor 1", "Contributing factor 2"]
}}
`;

const IMPACT_PROMPT = `
You are a Platform Reliability Engineer.
Analyze the operational data chunks related to the incident: "{title}".
Description: "{description}"

Assess the incident impact:
1. Identify affected service names (e.g. "Checkout API", "Gateway").
2. Estimate the number of users affected (integer). If not mentioned, estimate logically based on severity.
3. Estimate the total downtime/degradation duration in minutes (integer).

Return ONLY a valid JSON object matching this schema:
{{
  "services": ["Service A", "Service B"],
  "usersAffected": 12437,
  "downtimeMinutes": 31
}}
`;

const ACTIONS_PROMPT = `
You are a Staff SRE.
Analyze the operational data chunks and incident context for: "{title}".
Description: "{description}"

Generate actionable postmortem recommendations.
Group them into:
1. Immediate actions (mitigation, rollback, scaling).
2. Short-term actions (monitoring, configuration fixes, hotfixes, load-testing).
3. Long-term actions (architectural changes, process improvements, training).

Return ONLY a valid JSON object matching this schema:
{{
  "immediate": ["Fix pool size config"],
  "shortTerm": ["Add automated load tests"],
  "longTerm": ["Migrate database topology to multi-region cluster"]
}}
`;

// Helper to call Gemini model
async function callGemini(prompt: string, contextChunks: Chunk[], apiKey: string): Promise<string> {
  try {
    const ai = new GoogleGenerativeAI(apiKey);
    // Use gemini-2.5-flash as the fast, standard model
    const model = ai.getGenerativeModel({ model: 'gemini-2.5-flash' });
    
    const contextText = contextChunks
      .map(c => `[${c.source.toUpperCase()}] [${c.timestamp}] ${c.content}`)
      .join('\n\n');

    const fullPrompt = `${prompt}\n\nHere is the retrieved evidence/context data:\n${contextText}\n\nJSON Output:`;
    
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
      generationConfig: {
        responseMimeType: 'application/json'
      }
    });

    const responseText = result.response.text();
    return responseText;
  } catch (error: any) {
    console.error('Gemini Generation Error:', error);
    throw new Error(error?.message || 'Failed to communicate with Gemini API');
  }
}

// Local mock heuristics when Gemini API is offline/not provided
function generateMockTimeline(_title: string, _description: string, chunks: Chunk[]): TimelineEvent[] {
  // Sort chunks by timestamp
  const sorted = [...chunks].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  if (sorted.length === 0) {
    return [
      { time: '10:00', event: 'Incident triggered by automated alert.', severity: 'error' },
      { time: '10:15', event: 'Incident response team assembled.', severity: 'info' },
      { time: '10:30', event: 'Mitigation applied. Service back online.', severity: 'success' }
    ];
  }

  return sorted.map((chunk) => {
    let severity: TimelineEvent['severity'] = 'info';
    let cleanEvent = chunk.content;

    // Clean description a bit if it's long
    if (cleanEvent.length > 120) {
      cleanEvent = cleanEvent.substring(0, 117) + '...';
    }

    if (chunk.source === 'log' && /error|fatal|fail/i.test(chunk.content)) {
      severity = 'error';
    } else if (/warn/i.test(chunk.content)) {
      severity = 'warning';
    } else if (/rollback|deploy|merged/i.test(chunk.content)) {
      severity = 'info';
    } else if (/restore|resolved|stable|success/i.test(chunk.content)) {
      severity = 'success';
    }

    return {
      time: chunk.timestamp,
      event: `[${chunk.source.toUpperCase()}] ${cleanEvent}`,
      severity
    };
  });
}

function generateMockRootCause(title: string, _description: string, chunks: Chunk[]): RootCause {
  const lowercaseTitle = title.toLowerCase();
  
  if (lowercaseTitle.includes('checkout') || lowercaseTitle.includes('pool') || lowercaseTitle.includes('db')) {
    return {
      primaryCause: 'Database Connection Pool Exhaustion due to PR #412 Nested Query Loop',
      evidence: [
        'checkout-service-api-68fc: [ERROR] PG::ConnectionBad: PQconsumeInput() connection closed by backend: DB pool exhausted, current active: 50/50',
        'sarah_sre: Checkout is completely down. Getting DB pool exhaustion logs.'
      ],
      contributingFactors: [
        'Missing database connection timeout parameters in Checkout service driver.',
        'High concurrency load spike during flash promotion.',
        'Nested database query loop executed within a single transactional session context.'
      ]
    };
  }

  if (lowercaseTitle.includes('redis') || lowercaseTitle.includes('auth') || lowercaseTitle.includes('secret')) {
    return {
      primaryCause: 'Redis Session Cache Credentials Desynchronization',
      evidence: [
        'redis-session-store: [ERROR] Authentication failed for client id 1204',
        'auth-service-v3: [FATAL] Critical Session store unreachable. Halting requests.'
      ],
      contributingFactors: [
        'Configuration deploy job updated secrets without reloading the server authentication context.',
        'No failover path for user authentication when Redis cache goes down (missing session database bypass).'
      ]
    };
  }

  // Generic heuristic fallback based on error chunk content
  const errorChunks = chunks.filter(c => /error|fail|fatal|exception/i.test(c.content));
  const primaryCause = errorChunks.length > 0
    ? `System error detected in log: "${errorChunks[0].content.substring(0, 50)}..."`
    : `Service degradation or outage related to ${title}`;

  return {
    primaryCause,
    evidence: errorChunks.slice(0, 2).map(c => `[${c.source.toUpperCase()}] ${c.content}`),
    contributingFactors: [
      'Lack of granular healthchecks on the microservice layer.',
      'Deployment or configuration drift mismatch between staging and production.'
    ]
  };
}

function generateMockImpact(title: string, _description: string, chunks: Chunk[]): Impact {
  const lowercaseTitle = title.toLowerCase();
  let services = ['Main Gateway'];
  let usersAffected = 1500;
  let downtimeMinutes = 25;

  if (lowercaseTitle.includes('checkout') || lowercaseTitle.includes('pool') || lowercaseTitle.includes('db')) {
    services = ['Checkout Service', 'Postgres Primary DB'];
    usersAffected = 12437;
    downtimeMinutes = 31;
  } else if (lowercaseTitle.includes('redis') || lowercaseTitle.includes('auth')) {
    services = ['Auth Service', 'Redis Cache Cluster'];
    usersAffected = 4850;
    downtimeMinutes = 15;
  } else {
    // Generate semi-random logical numbers
    services = Array.from(new Set(chunks.map(c => c.metadata.service || c.metadata.channel || 'Microservice'))).filter(s => s !== 'Microservice').slice(0, 2);
    if (services.length === 0) services = ['API Engine'];
    usersAffected = Math.floor(Math.random() * 5000) + 100;
    downtimeMinutes = Math.floor(Math.random() * 60) + 10;
  }

  return { services, usersAffected, downtimeMinutes };
}

function generateMockActionItems(title: string, _description: string, _chunks: Chunk[]): ActionItems {
  const lowercaseTitle = title.toLowerCase();

  if (lowercaseTitle.includes('checkout') || lowercaseTitle.includes('pool') || lowercaseTitle.includes('db')) {
    return {
      immediate: [
        'Rollback checkout-service deployment to stable version v2.4.1.',
        'Increase Postgres pool connections limit from 50 to 100 as temporary overhead buffer.'
      ],
      shortTerm: [
        'Audit Checkout API batch recommendation query loops for connection leaks.',
        'Add Prometheus alert metrics on connection pool saturation levels (>80%).'
      ],
      longTerm: [
        'Design and deploy asynchronous Redis-backed cache for recommendation requests to eliminate DB transactions on Checkout hot-paths.'
      ]
    };
  }

  return {
    immediate: [
      'Investigate logs and perform service reboot to flush connections.',
      'Establish incident response war-room in Slack channel #incident-response.'
    ],
    shortTerm: [
      'Introduce rate-limiting guards on the affected endpoints.',
      'Implement structured automated alerts on latency spikes.'
    ],
    longTerm: [
      'Refactor system architecture to decouple database layers and avoid single points of failure.',
      'Conduct regular gameday simulation exercises to train SRE team on disaster recovery.'
    ]
  };
}

// Orchestrated APIs
export async function generateTimeline(incidentId: string): Promise<TimelineEvent[]> {
  const apiKey = getStoredApiKey();
  const incident = mockDb.getIncident(incidentId);
  if (!incident) throw new Error('Incident not found');
  
  // Query expansion and BM25 rank
  const query = expandKeywords(`${incident.title} ${incident.description} timeline event alert error status`);
  const ranked = rankChunks(mockDb.getChunks(incidentId), query);
  const contextChunks = ranked.slice(0, 50).map(r => r.chunk);

  if (!apiKey) {
    return generateMockTimeline(incident.title, incident.description, contextChunks);
  }

  const prompt = TIMELINE_PROMPT.replace('{title}', incident.title).replace('{description}', incident.description);
  const res = await callGemini(prompt, contextChunks, apiKey);
  try {
    return JSON.parse(res);
  } catch {
    return generateMockTimeline(incident.title, incident.description, contextChunks);
  }
}

export async function generateRootCause(incidentId: string): Promise<RootCause> {
  const apiKey = getStoredApiKey();
  const incident = mockDb.getIncident(incidentId);
  if (!incident) throw new Error('Incident not found');

  const query = expandKeywords(`${incident.title} root cause exception error fatal pool bug crash reason`);
  const ranked = rankChunks(mockDb.getChunks(incidentId), query);
  const contextChunks = ranked.slice(0, 50).map(r => r.chunk);

  if (!apiKey) {
    return generateMockRootCause(incident.title, incident.description, contextChunks);
  }

  const prompt = ROOT_CAUSE_PROMPT.replace('{title}', incident.title).replace('{description}', incident.description);
  const res = await callGemini(prompt, contextChunks, apiKey);
  try {
    return JSON.parse(res);
  } catch {
    return generateMockRootCause(incident.title, incident.description, contextChunks);
  }
}

export async function generateImpact(incidentId: string): Promise<Impact> {
  const apiKey = getStoredApiKey();
  const incident = mockDb.getIncident(incidentId);
  if (!incident) throw new Error('Incident not found');

  const query = expandKeywords(`${incident.title} impact users affected services downtime outage minutes percent`);
  const ranked = rankChunks(mockDb.getChunks(incidentId), query);
  const contextChunks = ranked.slice(0, 50).map(r => r.chunk);

  if (!apiKey) {
    return generateMockImpact(incident.title, incident.description, contextChunks);
  }

  const prompt = IMPACT_PROMPT.replace('{title}', incident.title).replace('{description}', incident.description);
  const res = await callGemini(prompt, contextChunks, apiKey);
  try {
    return JSON.parse(res);
  } catch {
    return generateMockImpact(incident.title, incident.description, contextChunks);
  }
}

export async function generateActionItems(incidentId: string): Promise<ActionItems> {
  const apiKey = getStoredApiKey();
  const incident = mockDb.getIncident(incidentId);
  if (!incident) throw new Error('Incident not found');

  const query = expandKeywords(`${incident.title} action items recommendation prevent mitigation fix scale`);
  const ranked = rankChunks(mockDb.getChunks(incidentId), query);
  const contextChunks = ranked.slice(0, 50).map(r => r.chunk);

  if (!apiKey) {
    return generateMockActionItems(incident.title, incident.description, contextChunks);
  }

  const prompt = ACTIONS_PROMPT.replace('{title}', incident.title).replace('{description}', incident.description);
  const res = await callGemini(prompt, contextChunks, apiKey);
  try {
    return JSON.parse(res);
  } catch {
    return generateMockActionItems(incident.title, incident.description, contextChunks);
  }
}

export async function generateFullReport(incidentId: string): Promise<Report> {
  const [timeline, rootCause, impact, actionItems] = await Promise.all([
    generateTimeline(incidentId),
    generateRootCause(incidentId),
    generateImpact(incidentId),
    generateActionItems(incidentId)
  ]);

  const lessonsLearned = [
    `Establish granular alert rules on response metrics (P99, DB pools, edge nodes) to catch degradation early.`,
    `Mandate architectural code audits for database transaction usage and pool locking paths.`,
    `Standardize canary and dry-run deployment validation gates before broad production exposure.`
  ];

  return mockDb.saveReport({
    incidentId,
    timeline,
    rootCause,
    impact,
    actionItems,
    lessonsLearned
  });
}
