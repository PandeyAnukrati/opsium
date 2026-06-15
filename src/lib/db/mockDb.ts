/* eslint-disable @typescript-eslint/no-explicit-any */
import { db } from '../firebase';
import { 
  collection, doc, getDocs, setDoc, updateDoc, onSnapshot, writeBatch
} from 'firebase/firestore';

export interface Organization {
  id: string;
  name: string;
  plan: string;
  createdAt: string;
}

export interface User {
  uid: string;
  organizationId: string;
  role: string;
  email: string;
}

export interface Incident {
  id: string;
  title: string;
  description: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  status: 'ACTIVE' | 'INVESTIGATING' | 'IDENTIFIED' | 'MITIGATED' | 'RESOLVED';
  createdBy: string;
  organizationId: string;
  createdAt: string;
}

export interface Document {
  id: string;
  incidentId: string;
  organizationId: string;
  fileName: string;
  fileType: string;
  content: string;
  storagePath: string;
  uploadedAt: string;
}

export interface Chunk {
  id: string;
  incidentId: string;
  source: string; // 'log' | 'slack' | 'jira' | 'email' etc.
  timestamp: string; // 'YYYY-MM-DD HH:mm:ss' or 'HH:mm:ss'
  content: string;
  keywords: string[];
  metadata: Record<string, any>;
}

export interface TimelineEvent {
  time: string;
  event: string;
  severity?: 'info' | 'warning' | 'error' | 'success';
}

export interface RootCause {
  primaryCause: string;
  evidence: string[];
  contributingFactors: string[];
}

export interface Impact {
  services: string[];
  usersAffected: number;
  downtimeMinutes: number;
}

export interface ActionItems {
  immediate: string[];
  shortTerm: string[];
  longTerm: string[];
}

export interface Report {
  id: string;
  incidentId: string;
  timeline: TimelineEvent[];
  rootCause: RootCause;
  impact: Impact;
  actionItems: ActionItems;
  lessonsLearned: string[];
  generatedAt: string;
}

const DEFAULT_ORG_ID = 'org-default';

// Pre-seeded sample data
const PRESEEDED_INCIDENTS: Incident[] = [
  {
    id: 'inc-db-leak',
    title: 'PostgreSQL Connection Pool Exhaustion in Checkout Service',
    description: 'During a flash sale spike, Checkout API latencies degraded to 10s+, causing cart drop-offs and database connection timeouts.',
    severity: 'CRITICAL',
    status: 'RESOLVED',
    createdBy: 'SRE Team',
    organizationId: DEFAULT_ORG_ID,
    createdAt: new Date(Date.now() - 4 * 3600 * 1000).toISOString() // 4 hours ago
  },
  {
    id: 'inc-redis-auth',
    title: 'Redis Cache Auth Failure on Session Store',
    description: 'A configuration sync job deployed a corrupted Redis secret, causing session validation failures and mass user logouts.',
    severity: 'HIGH',
    status: 'RESOLVED',
    createdBy: 'Platform Sec',
    organizationId: DEFAULT_ORG_ID,
    createdAt: new Date(Date.now() - 24 * 3600 * 1000).toISOString() // 24 hours ago
  },
  {
    id: 'inc-cdn-routing',
    title: 'Cloudflare Edge Routing Latency (US-East)',
    description: 'CDN edge nodes experienced routing loops leading to 502 Bad Gateway errors for about 12% of traffic in US East region.',
    severity: 'MEDIUM',
    status: 'RESOLVED',
    createdBy: 'DevOps Lead',
    organizationId: DEFAULT_ORG_ID,
    createdAt: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString() // 2 days ago
  }
];

const PRESEEDED_CHUNKS: Chunk[] = [
  // db-leak log chunks
  {
    id: 'c1',
    incidentId: 'inc-db-leak',
    source: 'log',
    timestamp: '10:04:12',
    content: 'checkout-service-api-68fc: [ERROR] PG::ConnectionBad: PQconsumeInput() connection closed by backend: DB pool exhausted, current active: 50/50, queue size: 100',
    keywords: ['checkout', 'error', 'pg', 'connection', 'pool', 'exhausted'],
    metadata: { service: 'checkout-service', level: 'ERROR' }
  },
  {
    id: 'c2',
    incidentId: 'inc-db-leak',
    source: 'log',
    timestamp: '10:04:30',
    content: 'checkout-service-api-68fc: [WARNING] Request checkout/submit timed out after 15000ms. Response code 504 Gateway Timeout.',
    keywords: ['checkout', 'timeout', '504', 'gateway'],
    metadata: { service: 'checkout-service', level: 'WARNING' }
  },
  {
    id: 'c3',
    incidentId: 'inc-db-leak',
    source: 'log',
    timestamp: '10:10:00',
    content: 'postgres-db-primary: [ERROR] FATAL: remaining connection slots are reserved for non-replication superuser connections',
    keywords: ['postgres', 'fatal', 'connection', 'slots', 'reserved'],
    metadata: { service: 'postgres-db', level: 'ERROR' }
  },
  {
    id: 'c4',
    incidentId: 'inc-db-leak',
    source: 'slack',
    timestamp: '10:05:15',
    content: '[#ops-alerts] SRE-Bot: Alert triggered - checkout-service p99 response time > 5000ms (Current: 12450ms)',
    keywords: ['alert', 'ops-alerts', 'p99', 'checkout'],
    metadata: { channel: '#ops-alerts', sender: 'SRE-Bot' }
  },
  {
    id: 'c5',
    incidentId: 'inc-db-leak',
    source: 'slack',
    timestamp: '10:06:02',
    content: '[#incident-checkout-db] sarah_sre: Checkout is completely down. Getting DB pool exhaustion logs. Did we deploy anything recently?',
    keywords: ['checkout', 'pool', 'exhaustion', 'deploy'],
    metadata: { channel: '#incident-checkout-db', sender: 'sarah_sre' }
  },
  {
    id: 'c6',
    incidentId: 'inc-db-leak',
    source: 'slack',
    timestamp: '10:07:44',
    content: '[#incident-checkout-db] alex_dev: We merged PR #412 (Add batch recommendations on checkout page) 15 mins ago. It does a nested loop query on checkout items.',
    keywords: ['pr', 'recommendations', 'query', 'checkout'],
    metadata: { channel: '#incident-checkout-db', sender: 'alex_dev' }
  },
  {
    id: 'c7',
    incidentId: 'inc-db-leak',
    source: 'jira',
    timestamp: '10:06:40',
    content: 'INC-942: Checkout service failing with 504. Assigned to Sarah SRE. Severity: Critical. Priority: P0.',
    keywords: ['inc-942', 'checkout', '504', 'sre', 'critical'],
    metadata: { project: 'INCIDENT', ticket: 'INC-942' }
  },
  {
    id: 'c8',
    incidentId: 'inc-db-leak',
    source: 'log',
    timestamp: '10:22:10',
    content: 'k8s-deploy-runner: Initiating rollback of deployment checkout-service-api to version v2.4.1 (previous stable)',
    keywords: ['rollback', 'deployment', 'checkout-service'],
    metadata: { service: 'kubernetes', level: 'INFO' }
  },
  {
    id: 'c9',
    incidentId: 'inc-db-leak',
    source: 'log',
    timestamp: '10:29:15',
    content: 'checkout-service-api-74fd: [INFO] DB connection established. Pool active: 5/50. Average response time: 84ms.',
    keywords: ['db', 'connection', 'established', 'pool', 'active'],
    metadata: { service: 'checkout-service', level: 'INFO' }
  }
];

const PRESEEDED_REPORTS: Report[] = [
  {
    id: 'rep-db-leak',
    incidentId: 'inc-db-leak',
    timeline: [
      { time: '09:50', event: 'Deployment of checkout-service v2.4.2 containing batch recommendation query PR #412 completed.', severity: 'info' },
      { time: '10:04', event: 'Error rate on checkout API spike. Checkout DB connection pool exhausts at 50/50 connections.', severity: 'error' },
      { time: '10:05', event: 'Automated P99 response time alert triggers in slack channel #ops-alerts.', severity: 'warning' },
      { time: '10:06', event: 'Sarah (SRE) spins up incident channel #incident-checkout-db and declares P0.', severity: 'info' },
      { time: '10:07', event: 'Alex (Developer) identifies potential connection leak in PR #412 (nested loop queries without releasing connection).', severity: 'info' },
      { time: '10:22', event: 'Decision made by Incident Commander to rollback checkout-service-api to v2.4.1.', severity: 'info' },
      { time: '10:29', event: 'Rollback completed. Database connections drop to normal levels. Checkout API response times return to 84ms.', severity: 'success' }
    ],
    rootCause: {
      primaryCause: 'Database Connection Pool Exhaustion due to Unoptimized Queries',
      evidence: [
        'checkout-service-api-68fc: [ERROR] PG::ConnectionBad: PQconsumeInput() connection closed by backend: DB pool exhausted, current active: 50/50',
        'PR #412 introduced a nested loop query on database rows without using connection transaction releasing blocks.'
      ],
      contributingFactors: [
        'Lack of load testing for checkout endpoints with batch recommendations active.',
        'No rate limiting on recommendation queries under high concurrent loads.',
        'Insufficient alerting thresholds on PostgreSQL connection pool utilization.'
      ]
    },
    impact: {
      services: ['Checkout API', 'Postgres DB Server'],
      usersAffected: 12437,
      downtimeMinutes: 39
    },
    actionItems: {
      immediate: [
        'Verify database connection pool active slots are stable post-rollback.',
        'Review and optimize recommendation database query code in PR #412.'
      ],
      shortTerm: [
        'Implement an auto-release wrapper for database connection instances across all checkout API paths.',
        'Setup alert monitors for DB connection pool utilization exceeding 80% capacity.'
      ],
      longTerm: [
        'Conduct full load testing of checkout flow dependencies before major schema or recommendation logic changes.',
        'Move recommendations query path to a read-replica database instance instead of the primary transactional DB.'
      ]
    },
    lessonsLearned: [
      'Unindexed nested loop queries on transactional databases can easily trigger cascade pool exhaustion.',
      'Deployment rolls should have automated regression rollbacks when API p99 latencies exceed predefined thresholds.'
    ],
    generatedAt: new Date(Date.now() - 3.5 * 3600 * 1000).toISOString()
  }
];

class MockDb {
  private isInitialized = false;

  constructor() {
    this.setupFirestoreSync();
  }

  private setupFirestoreSync() {
    if (this.isInitialized) return;
    this.isInitialized = true;

    // Load initial seed to local storage if empty
    this.initSeed();

    // Sync incidents collection from Firestore
    onSnapshot(collection(db, 'incidents'), async (snapshot) => {
      if (snapshot.empty) {
        try {
          const batch = writeBatch(db);
          PRESEEDED_INCIDENTS.forEach(inc => {
            batch.set(doc(db, 'incidents', inc.id), inc);
          });
          await batch.commit();
        } catch (err) {
          console.error('Firestore incidents seeding failed:', err);
        }
        return;
      }
      const incidentsList: Incident[] = [];
      snapshot.forEach(docSnap => {
        incidentsList.push(docSnap.data() as Incident);
      });
      incidentsList.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      this.setStorageItem('incidents', incidentsList);
      window.dispatchEvent(new Event('opsium_db_sync'));
    });

    // Sync chunks collection from Firestore
    onSnapshot(collection(db, 'chunks'), async (snapshot) => {
      if (snapshot.empty) {
        try {
          const batch = writeBatch(db);
          PRESEEDED_CHUNKS.forEach(chunk => {
            batch.set(doc(db, 'chunks', chunk.id), chunk);
          });
          await batch.commit();
        } catch (err) {
          console.error('Firestore chunks seeding failed:', err);
        }
        return;
      }
      const chunksList: Chunk[] = [];
      snapshot.forEach(docSnap => {
        chunksList.push(docSnap.data() as Chunk);
      });
      this.setStorageItem('chunks', chunksList);
      window.dispatchEvent(new Event('opsium_db_sync'));
    });

    // Sync reports collection from Firestore
    onSnapshot(collection(db, 'reports'), async (snapshot) => {
      if (snapshot.empty) {
        try {
          const batch = writeBatch(db);
          PRESEEDED_REPORTS.forEach(rep => {
            batch.set(doc(db, 'reports', rep.id), rep);
          });
          await batch.commit();
        } catch (err) {
          console.error('Firestore reports seeding failed:', err);
        }
        return;
      }
      const reportsList: Report[] = [];
      snapshot.forEach(docSnap => {
        reportsList.push(docSnap.data() as Report);
      });
      this.setStorageItem('reports', reportsList);
      window.dispatchEvent(new Event('opsium_db_sync'));
    });

    // Sync documents collection from Firestore
    onSnapshot(collection(db, 'documents'), (snapshot) => {
      const docsList: Document[] = [];
      snapshot.forEach(docSnap => {
        docsList.push(docSnap.data() as Document);
      });
      this.setStorageItem('documents', docsList);
      window.dispatchEvent(new Event('opsium_db_sync'));
    });
  }

  private getStorageItem<T>(key: string, defaultValue: T): T {
    const val = localStorage.getItem(`opsium_${key}`);
    if (!val) {
      localStorage.setItem(`opsium_${key}`, JSON.stringify(defaultValue));
      return defaultValue;
    }
    try {
      return JSON.parse(val);
    } catch {
      return defaultValue;
    }
  }

  private setStorageItem<T>(key: string, value: T): void {
    localStorage.setItem(`opsium_${key}`, JSON.stringify(value));
  }

  initSeed() {
    this.getStorageItem<Incident[]>('incidents', PRESEEDED_INCIDENTS);
    this.getStorageItem<Chunk[]>('chunks', PRESEEDED_CHUNKS);
    this.getStorageItem<Report[]>('reports', PRESEEDED_REPORTS);
    this.getStorageItem<Document[]>('documents', []);
  }

  // Incidents
  getIncidents(): Incident[] {
    this.initSeed();
    return this.getStorageItem<Incident[]>('incidents', []);
  }

  getIncident(id: string): Incident | undefined {
    return this.getIncidents().find(inc => inc.id === id);
  }

  createIncident(incident: Omit<Incident, 'id' | 'createdAt' | 'organizationId' | 'createdBy'>): Incident {
    const incidents = this.getIncidents();
    const newInc: Incident = {
      ...incident,
      id: `inc-${Math.random().toString(36).substr(2, 9)}`,
      createdBy: 'You (SRE)',
      organizationId: DEFAULT_ORG_ID,
      createdAt: new Date().toISOString()
    };
    incidents.unshift(newInc);
    this.setStorageItem('incidents', incidents);

    // Save asynchronously to Firestore
    setDoc(doc(db, 'incidents', newInc.id), newInc).catch(err => {
      console.error('Firestore save incident error:', err);
    });

    return newInc;
  }

  updateIncidentStatus(id: string, status: Incident['status']): Incident | undefined {
    const incidents = this.getIncidents();
    const index = incidents.findIndex(inc => inc.id === id);
    if (index !== -1) {
      incidents[index].status = status;
      this.setStorageItem('incidents', incidents);

      // Save asynchronously to Firestore
      updateDoc(doc(db, 'incidents', id), { status }).catch(err => {
        console.error('Firestore update incident status error:', err);
      });

      return incidents[index];
    }
    return undefined;
  }

  // Documents
  getDocuments(incidentId?: string): Document[] {
    const docs = this.getStorageItem<Document[]>('documents', []);
    if (incidentId) {
      return docs.filter(doc => doc.incidentId === incidentId);
    }
    return docs;
  }

  addDocument(docData: Omit<Document, 'id' | 'uploadedAt' | 'organizationId'>): Document {
    const docs = this.getDocuments();
    const newDoc: Document = {
      ...docData,
      id: `doc-${Math.random().toString(36).substr(2, 9)}`,
      organizationId: DEFAULT_ORG_ID,
      uploadedAt: new Date().toISOString()
    };
    docs.push(newDoc);
    this.setStorageItem('documents', docs);

    // Save asynchronously to Firestore
    setDoc(doc(db, 'documents', newDoc.id), newDoc).catch(err => {
      console.error('Firestore save document error:', err);
    });

    return newDoc;
  }

  // Chunks
  getChunks(incidentId?: string): Chunk[] {
    const chunks = this.getStorageItem<Chunk[]>('chunks', []);
    if (incidentId) {
      return chunks.filter(c => c.incidentId === incidentId);
    }
    return chunks;
  }

  addChunks(newChunks: Omit<Chunk, 'id'>[]): void {
    const chunks = this.getChunks();
    const formatted: Chunk[] = newChunks.map(c => ({
      ...c,
      id: `chunk-${Math.random().toString(36).substr(2, 9)}`
    }));
    chunks.push(...formatted);
    this.setStorageItem('chunks', chunks);

    // Save asynchronously in a batch to Firestore
    try {
      const batch = writeBatch(db);
      formatted.forEach(chunk => {
        batch.set(doc(db, 'chunks', chunk.id), chunk);
      });
      batch.commit().catch(err => {
        console.error('Firestore batch commit chunks error:', err);
      });
    } catch (err) {
      console.error('Firestore writeBatch chunks setup error:', err);
    }
  }

  // Reports
  getReports(): Report[] {
    return this.getStorageItem<Report[]>('reports', []);
  }

  getReport(incidentId: string): Report | undefined {
    return this.getReports().find(rep => rep.incidentId === incidentId);
  }

  saveReport(report: Omit<Report, 'id' | 'generatedAt'>): Report {
    const reports = this.getReports();
    const existingIndex = reports.findIndex(rep => rep.incidentId === report.incidentId);

    const savedRep: Report = {
      ...report,
      id: existingIndex !== -1 ? reports[existingIndex].id : `rep-${Math.random().toString(36).substr(2, 9)}`,
      generatedAt: new Date().toISOString()
    };

    if (existingIndex !== -1) {
      reports[existingIndex] = savedRep;
    } else {
      reports.push(savedRep);
    }

    this.setStorageItem('reports', reports);

    // Save asynchronously to Firestore
    setDoc(doc(db, 'reports', savedRep.id), savedRep).catch(err => {
      console.error('Firestore save report error:', err);
    });

    return savedRep;
  }

  // Reset database helper
  async resetDb(): Promise<void> {
    localStorage.removeItem('opsium_incidents');
    localStorage.removeItem('opsium_chunks');
    localStorage.removeItem('opsium_reports');
    localStorage.removeItem('opsium_documents');

    // Wipe Firestore collections asynchronously
    try {
      const collectionsList = ['incidents', 'chunks', 'reports', 'documents'];
      for (const colName of collectionsList) {
        const snapshot = await getDocs(collection(db, colName));
        const batch = writeBatch(db);
        snapshot.forEach(docSnap => {
          batch.delete(doc(db, colName, docSnap.id));
        });
        await batch.commit();
      }
    } catch (err) {
      console.error('Firestore database reset failed:', err);
    }
  }
}

export const mockDb = new MockDb();
mockDb.initSeed();
