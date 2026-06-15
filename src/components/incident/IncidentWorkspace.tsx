/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef } from 'react';
import { mockDb } from '../../lib/db/mockDb';
import type { Incident, Document, RootCause, Impact, ActionItems, Report } from '../../lib/db/mockDb';
import { parseFileContent } from '../../lib/retrieval/parser';
import { rankChunks } from '../../lib/retrieval/bm25';
import type { SearchResult } from '../../lib/retrieval/bm25';
import { HuggingFaceEmbeddings, MemoryVectorStore } from '../../lib/retrieval/vectorStore';
import type { Document as VectorDoc } from '../../lib/retrieval/vectorStore';
import { generateTimeline, generateRootCause, generateImpact, generateActionItems, generateFullReport } from '../../lib/gemini/client';
import { 
  FileText, Search, Loader2, Sparkles, Plus, Trash2, 
  Download, Copy, RefreshCw, Layers, 
  FileCode, ListTodo, FileSpreadsheet, Send, ChevronDown
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '../ui/dropdown-menu';
import { Checkbox } from '../ui/checkbox';

interface IncidentWorkspaceProps {
  incidentId: string;
  onBackToDashboard: () => void;
}

export default function IncidentWorkspace({ incidentId, onBackToDashboard }: IncidentWorkspaceProps) {
  const [incident, setIncident] = useState<Incident | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  
  // Left Panel search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [expandedScoreIdx, setExpandedScoreIdx] = useState<number | null>(null);
  const [searchMode, setSearchMode] = useState<'bm25' | 'vector'>('bm25');
  const [isSearching, setIsSearching] = useState(false);

  // Tabs state
  const [activeTab, setActiveTab] = useState<'timeline' | 'root-cause' | 'impact' | 'actions' | 'report'>('timeline');

  // Generation status
  const [isGenerating, setIsGenerating] = useState<Record<string, boolean>>({
    timeline: false,
    rootCause: false,
    impact: false,
    actions: false,
    report: false
  });

  // Edit states for reports
  const [newTime, setNewTime] = useState('');
  const [newEvent, setNewEvent] = useState('');
  const [newSev, setNewSev] = useState<'info' | 'warning' | 'error' | 'success'>('info');

  const [rootCauseEdit, setRootCauseEdit] = useState<RootCause>({ primaryCause: '', evidence: [], contributingFactors: [] });
  const [impactEdit, setImpactEdit] = useState<Impact>({ services: [], usersAffected: 0, downtimeMinutes: 0 });
  const [actionItemsEdit, setActionItemsEdit] = useState<ActionItems>({ immediate: [], shortTerm: [], longTerm: [] });

  // Custom text adders
  const [newFactor, setNewFactor] = useState('');
  const [newEvidence, setNewEvidence] = useState('');
  const [newAction, setNewAction] = useState({ text: '', type: 'immediate' as 'immediate' | 'shortTerm' | 'longTerm' });

  const loadData = () => {
    const inc = mockDb.getIncident(incidentId);
    if (!inc) {
      onBackToDashboard();
      return;
    }
    setIncident(inc);
    setDocuments(mockDb.getDocuments(incidentId));
    
    const rep = mockDb.getReport(incidentId);
    if (rep) {
      setReport(rep);
      setRootCauseEdit(rep.rootCause);
      setImpactEdit(rep.impact);
      setActionItemsEdit(rep.actionItems);
    } else {
      setReport(null);
      setRootCauseEdit({ primaryCause: '', evidence: [], contributingFactors: [] });
      setImpactEdit({ services: [], usersAffected: 0, downtimeMinutes: 0 });
      setActionItemsEdit({ immediate: [], shortTerm: [], longTerm: [] });
    }
  };

  // Load incident details and existing report
  useEffect(() => {
    const timer = setTimeout(() => {
      loadData();
    }, 0);
    window.addEventListener('opsium_db_sync', loadData);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('opsium_db_sync', loadData);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incidentId]);

  // Run BM25 or Vector search when query changes
  useEffect(() => {
    if (!incidentId) return;
    const allChunks = mockDb.getChunks(incidentId);
    if (searchQuery.trim().length === 0) {
      const timer = setTimeout(() => {
        setSearchResults(allChunks.slice(0, 15).map(c => ({
          chunk: c,
          score: 0,
          explanations: [],
          metadataBoost: 0
        })));
      }, 0);
      return () => clearTimeout(timer);
    }

    if (searchMode === 'bm25') {
      const ranked = rankChunks(allChunks, searchQuery);
      const timer = setTimeout(() => {
        setSearchResults(ranked);
      }, 0);
      return () => clearTimeout(timer);
    } else {
      const performVectorSearch = async () => {
        setIsSearching(true);
        try {
          const hfEmbeddings = new HuggingFaceEmbeddings();
          const store = new MemoryVectorStore(hfEmbeddings);
          const docs: VectorDoc[] = allChunks.map(c => ({
            pageContent: c.content,
            metadata: { chunk: c }
          }));
          await store.addDocuments(docs);
          const results = await store.similaritySearch(searchQuery, 30);
          
          setSearchResults(results.map(r => {
            const chunk = r[0].metadata.chunk;
            const score = r[1];
            return {
              chunk,
              score: Number(score.toFixed(4)),
              explanations: [{
                term: 'Cosine Similarity (Hugging Face Embedding)',
                tf: score,
                idf: 1,
                lengthPenalty: 0,
                score: score
              }],
              metadataBoost: 0
            };
          }));
        } catch (err) {
          console.error('Vector search failed, falling back to BM25:', err);
          const ranked = rankChunks(allChunks, searchQuery);
          setSearchResults(ranked);
        } finally {
          setIsSearching(false);
        }
      };
      performVectorSearch();
    }
  }, [searchQuery, searchMode, incidentId]);


  const handleStatusChange = (status: Incident['status']) => {
    mockDb.updateIncidentStatus(incidentId, status);
    loadData();
  };

  // Document upload ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    Array.from(e.target.files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        
        mockDb.addDocument({
          incidentId,
          fileName: file.name,
          fileType: file.type || file.name.split('.').pop() || 'txt',
          content: text,
          storagePath: `incidents/${incidentId}/${file.name}`
        });

        const parsed = parseFileContent(file.name, text, incidentId);
        mockDb.addChunks(parsed);
        
        loadData();
      };
      reader.readAsText(file);
    });
  };

  // Spark generation handlers
  const runGenerateTimeline = async () => {
    setIsGenerating(prev => ({ ...prev, timeline: true }));
    try {
      const tl = await generateTimeline(incidentId);
      const updatedReport = report 
        ? { ...report, timeline: tl } 
        : { incidentId, timeline: tl, rootCause: rootCauseEdit, impact: impactEdit, actionItems: actionItemsEdit, lessonsLearned: [], generatedAt: new Date().toISOString(), id: '' };
      
      const saved = mockDb.saveReport(updatedReport);
      setReport(saved);
      // switch focus to display
    } catch (err) {
      console.error(err);
    } finally {
      setIsGenerating(prev => ({ ...prev, timeline: false }));
    }
  };

  const runGenerateRootCause = async () => {
    setIsGenerating(prev => ({ ...prev, rootCause: true }));
    try {
      const rc = await generateRootCause(incidentId);
      setRootCauseEdit(rc);
      const updatedReport = report 
        ? { ...report, rootCause: rc } 
        : { incidentId, timeline: [], rootCause: rc, impact: impactEdit, actionItems: actionItemsEdit, lessonsLearned: [], generatedAt: new Date().toISOString(), id: '' };
      
      const saved = mockDb.saveReport(updatedReport);
      setReport(saved);
    } catch (err) {
      console.error(err);
    } finally {
      setIsGenerating(prev => ({ ...prev, rootCause: false }));
    }
  };

  const runGenerateImpact = async () => {
    setIsGenerating(prev => ({ ...prev, impact: true }));
    try {
      const imp = await generateImpact(incidentId);
      setImpactEdit(imp);
      const updatedReport = report 
        ? { ...report, impact: imp } 
        : { incidentId, timeline: [], rootCause: rootCauseEdit, impact: imp, actionItems: actionItemsEdit, lessonsLearned: [], generatedAt: new Date().toISOString(), id: '' };
      
      const saved = mockDb.saveReport(updatedReport);
      setReport(saved);
    } catch (err) {
      console.error(err);
    } finally {
      setIsGenerating(prev => ({ ...prev, impact: false }));
    }
  };

  const runGenerateActions = async () => {
    setIsGenerating(prev => ({ ...prev, actions: true }));
    try {
      const act = await generateActionItems(incidentId);
      setActionItemsEdit(act);
      const updatedReport = report 
        ? { ...report, actionItems: act } 
        : { incidentId, timeline: [], rootCause: rootCauseEdit, impact: impactEdit, actionItems: act, lessonsLearned: [], generatedAt: new Date().toISOString(), id: '' };
      
      const saved = mockDb.saveReport(updatedReport);
      setReport(saved);
    } catch (err) {
      console.error(err);
    } finally {
      setIsGenerating(prev => ({ ...prev, actions: false }));
    }
  };

  const runFullSynthesize = async () => {
    setIsGenerating(prev => ({ ...prev, report: true }));
    try {
      const rep = await generateFullReport(incidentId);
      setReport(rep);
      setRootCauseEdit(rep.rootCause);
      setImpactEdit(rep.impact);
      setActionItemsEdit(rep.actionItems);
      setActiveTab('report');
    } catch (err) {
      console.error(err);
    } finally {
      setIsGenerating(prev => ({ ...prev, report: false }));
    }
  };

  // Timeline list manipulations
  const addTimelineEvent = () => {
    if (!newTime || !newEvent) return;
    const currentTimeline = report?.timeline || [];
    const updated = [...currentTimeline, { time: newTime, event: newEvent, severity: newSev }]
      .sort((a, b) => a.time.localeCompare(b.time));

    const saved = mockDb.saveReport({
      incidentId,
      timeline: updated,
      rootCause: rootCauseEdit,
      impact: impactEdit,
      actionItems: actionItemsEdit,
      lessonsLearned: report?.lessonsLearned || []
    });

    setReport(saved);
    setNewTime('');
    setNewEvent('');
    setNewSev('info');
  };

  const deleteTimelineEvent = (idx: number) => {
    const currentTimeline = report?.timeline || [];
    const updated = currentTimeline.filter((_, i) => i !== idx);

    const saved = mockDb.saveReport({
      incidentId,
      timeline: updated,
      rootCause: rootCauseEdit,
      impact: impactEdit,
      actionItems: actionItemsEdit,
      lessonsLearned: report?.lessonsLearned || []
    });
    setReport(saved);
  };

  // Root Cause bullet edits
  const addRootCauseFactor = () => {
    if (!newFactor.trim()) return;
    const updatedFactors = [...rootCauseEdit.contributingFactors, newFactor.trim()];
    const newRc = { ...rootCauseEdit, contributingFactors: updatedFactors };
    setRootCauseEdit(newRc);
    
    if (report) {
      mockDb.saveReport({ ...report, rootCause: newRc });
    }
    setNewFactor('');
  };

  const deleteRootCauseFactor = (idx: number) => {
    const updatedFactors = rootCauseEdit.contributingFactors.filter((_, i) => i !== idx);
    const newRc = { ...rootCauseEdit, contributingFactors: updatedFactors };
    setRootCauseEdit(newRc);
    
    if (report) {
      mockDb.saveReport({ ...report, rootCause: newRc });
    }
  };

  const addEvidenceQuote = () => {
    if (!newEvidence.trim()) return;
    const updatedEvidence = [...rootCauseEdit.evidence, newEvidence.trim()];
    const newRc = { ...rootCauseEdit, evidence: updatedEvidence };
    setRootCauseEdit(newRc);

    if (report) {
      mockDb.saveReport({ ...report, rootCause: newRc });
    }
    setNewEvidence('');
  };

  const deleteEvidenceQuote = (idx: number) => {
    const updatedEvidence = rootCauseEdit.evidence.filter((_, i) => i !== idx);
    const newRc = { ...rootCauseEdit, evidence: updatedEvidence };
    setRootCauseEdit(newRc);

    if (report) {
      mockDb.saveReport({ ...report, rootCause: newRc });
    }
  };

  const saveRootCauseDetails = () => {
    if (report) {
      const saved = mockDb.saveReport({ ...report, rootCause: rootCauseEdit });
      setReport(saved);
    }
  };

  // Impact details update
  const saveImpactDetails = () => {
    if (report) {
      const saved = mockDb.saveReport({ ...report, impact: impactEdit });
      setReport(saved);
    }
  };

  // Action Items lists update
  const addActionItem = () => {
    if (!newAction.text.trim()) return;
    const currentActions = { ...actionItemsEdit };
    currentActions[newAction.type] = [...currentActions[newAction.type], newAction.text.trim()];
    setActionItemsEdit(currentActions);

    if (report) {
      mockDb.saveReport({ ...report, actionItems: currentActions });
    }
    setNewAction(prev => ({ ...prev, text: '' }));
  };

  const deleteActionItem = (type: keyof ActionItems, idx: number) => {
    const currentActions = { ...actionItemsEdit };
    currentActions[type] = currentActions[type].filter((_, i) => i !== idx);
    setActionItemsEdit(currentActions);

    if (report) {
      mockDb.saveReport({ ...report, actionItems: currentActions });
    }
  };

  // Report Markdown Exporter
  const generateMarkdownReport = (): string => {
    if (!report || !incident) return '# No Report Generated';

    return `# Incident Postmortem: ${incident.title}
**Date Generated:** ${new Date(report.generatedAt).toLocaleString()}
**Severity:** ${incident.severity} | **Status:** ${incident.status}

## 1. Executive Summary
${incident.description}

## 2. Incident Timeline
| Time | Event |
| --- | --- |
${report.timeline.map(t => `| ${t.time} | ${t.event} |`).join('\n')}

## 3. Root Cause Analysis
### Primary Cause
${report.rootCause.primaryCause}

### Contributing Factors
${report.rootCause.contributingFactors.map(f => `- ${f}`).join('\n')}

### Evidence Logs
${report.rootCause.evidence.map(e => `> ${e}`).join('\n\n')}

## 4. Operational Impact
- **Affected Services:** ${report.impact.services.join(', ')}
- **Users Impacted:** ${report.impact.usersAffected.toLocaleString()} users
- **Downtime Duration:** ${report.impact.downtimeMinutes} Minutes

## 5. Preventive Action Items
### Immediate Actions
${report.actionItems.immediate.map(a => `- [ ] ${a}`).join('\n')}

### Short-Term Actions
${report.actionItems.shortTerm.map(a => `- [ ] ${a}`).join('\n')}

### Long-Term Actions
${report.actionItems.longTerm.map(a => `- [ ] ${a}`).join('\n')}

## 6. Key Lessons Learned
${report.lessonsLearned.map(l => `- ${l}`).join('\n')}
`;
  };

  const handleCopyMarkdown = () => {
    const md = generateMarkdownReport();
    navigator.clipboard.writeText(md);
    alert('Postmortem report copied to clipboard in Markdown format!');
  };

  const handleDownloadMarkdown = () => {
    const md = generateMarkdownReport();
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `postmortem-${incidentId}.md`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // UI Icons matching sources
  const getSourceIcon = (source: string) => {
    switch (source) {
      case 'log':
        return <FileCode className="h-4 w-4 text-violet-400" />;
      case 'slack':
        return <Send className="h-4 w-4 text-emerald-400 animate-pulse" />;
      case 'jira':
        return <ListTodo className="h-4 w-4 text-blue-400" />;
      case 'csv':
        return <FileSpreadsheet className="h-4 w-4 text-yellow-400" />;
      default:
        return <FileText className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getSourceBadgeColor = (source: string) => {
    switch (source) {
      case 'log':
        return 'bg-violet-500/10 text-violet-400 border-violet-500/20';
      case 'slack':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'jira':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      case 'csv':
        return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
      default:
        return 'bg-muted text-muted-foreground border-border';
    }
  };

  if (!incident) return null;

  return (
    <div className="space-y-6">
      
      {/* Workspace Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-border">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <button 
              onClick={onBackToDashboard}
              className="text-xs font-semibold text-muted-foreground hover:text-foreground hover:underline mr-2 transition-all cursor-pointer"
            >
              &larr; Back to Dashboard
            </button>
            <span className="text-xs px-2 py-0.5 rounded font-mono bg-muted text-muted-foreground uppercase border border-border">
              {incident.id}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded font-bold border ${
              incident.severity === 'CRITICAL' ? 'bg-red-500/10 text-red-500 border-red-500/20' :
              incident.severity === 'HIGH' ? 'bg-orange-500/10 text-orange-500 border-orange-500/20' :
              incident.severity === 'MEDIUM' ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' :
              'bg-blue-500/10 text-blue-500 border-blue-500/20'
            }`}>
              {incident.severity}
            </span>
          </div>
          <h2 className="text-2xl font-bold tracking-tight">{incident.title}</h2>
        </div>

        {/* Action controls */}
        <div className="flex flex-wrap gap-2.5 items-center">
          {/* Status selector */}
          <div className="flex items-center gap-1.5 bg-card border border-border rounded-lg px-3 py-1.5 text-xs font-semibold">
            <span className="text-muted-foreground uppercase">Status:</span>
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-1 font-bold text-primary focus:outline-none uppercase cursor-pointer hover:opacity-85 select-none">
                {incident.status}
                <ChevronDown className="h-3.5 w-3.5 text-primary" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-popover border border-border text-popover-foreground">
                <DropdownMenuItem onClick={() => handleStatusChange('ACTIVE')} className="uppercase font-semibold cursor-pointer">
                  Active
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleStatusChange('INVESTIGATING')} className="uppercase font-semibold cursor-pointer">
                  Investigating
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleStatusChange('IDENTIFIED')} className="uppercase font-semibold cursor-pointer">
                  Identified
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleStatusChange('MITIGATED')} className="uppercase font-semibold cursor-pointer">
                  Mitigated
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleStatusChange('RESOLVED')} className="uppercase font-semibold cursor-pointer">
                  Resolved
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <button
            onClick={runFullSynthesize}
            disabled={isGenerating.report}
            className="flex items-center justify-center gap-2 px-3.5 py-1.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold rounded-lg shadow-md disabled:opacity-50 transition-all cursor-pointer text-xs uppercase"
          >
            {isGenerating.report ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Synthesizing...
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5" />
                AI Postmortem
              </>
            )}
          </button>
        </div>
      </div>

      {/* Dual Panel Split Pane */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        
        {/* Left Panel: Evidence Uploads & Chunk Explorer (45%) */}
        <div className="xl:col-span-5 space-y-6">
          
          {/* Document Upload card */}
          <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Layers className="h-4 w-4 text-primary" />
                Evidence Logs ({documents.length})
              </h3>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-xs font-semibold text-primary hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Plus className="h-3 w-3" /> Upload File
              </button>
              <input
                type="file"
                multiple
                ref={fileInputRef}
                onChange={handleFileUpload}
                className="hidden"
                accept=".txt,.log,.json,.csv"
              />
            </div>

            {documents.length === 0 ? (
              <div className="p-6 border border-dashed border-border rounded-lg text-center text-xs text-muted-foreground">
                No logs loaded. Click upload to index operational data.
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto pr-1">
                {documents.map((doc) => (
                  <div 
                    key={doc.id}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-muted/60 border border-border text-xs"
                    title={doc.fileName}
                  >
                    <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="max-w-[120px] truncate font-medium">{doc.fileName}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Real-time BM25 Evidence Explorer */}
          <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden flex flex-col max-h-[600px]">
            {/* Search header */}
            <div className="p-4 border-b border-border bg-muted/10 space-y-3">
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Search className="h-4 w-4 text-primary" />
                  Explainable RAG Search
                </h3>
                {isSearching && (
                  <span className="flex items-center gap-1 text-[10px] text-primary">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Vectorizing...
                  </span>
                )}
              </div>
              <div className="relative">
                <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Query raw logs (e.g. pool timeout, error)..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-8 pr-3 py-1.5 w-full text-xs bg-background border border-input rounded-md focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>
              <div className="flex items-center justify-between text-[10px] pt-1">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSearchMode('bm25')}
                    className={`px-2.5 py-1 rounded font-medium transition-all cursor-pointer ${
                      searchMode === 'bm25'
                        ? 'bg-primary/10 text-primary border border-primary/20'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Keyword (BM25)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSearchMode('vector')}
                    className={`px-2.5 py-1 rounded font-medium transition-all cursor-pointer ${
                      searchMode === 'vector'
                        ? 'bg-primary/10 text-primary border border-primary/20'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Vector Semantic (LangChain)
                  </button>
                </div>
                {searchMode === 'vector' && (
                  <span className="text-[9px] text-muted-foreground bg-slate-900 border border-slate-800 px-1.5 py-0.5 rounded uppercase tracking-wider font-semibold font-mono">
                    {localStorage.getItem('opsium_hf_token') ? 'Live Embeddings' : 'Demo Mode'}
                  </span>
                )}
              </div>
              {searchQuery && (
                <div className="text-[10px] text-muted-foreground">
                  Scoring <span className="font-semibold text-primary">{searchResults.length}</span> documents using {searchMode === 'bm25' ? 'BM25' : 'Cosine Similarity'}.
                </div>
              )}
            </div>

            {/* Results feed */}
            <div className="overflow-y-auto flex-1 divide-y divide-border/60 p-2">
              {searchResults.length === 0 ? (
                <div className="p-12 text-center text-xs text-muted-foreground">
                  No text chunks matching criteria found.
                </div>
              ) : (
                searchResults.map((res, index) => {
                  const isExpanded = expandedScoreIdx === index;
                  
                  return (
                    <div key={res.chunk.id} className="p-3 hover:bg-muted/30 transition-colors space-y-2 text-xs">
                      {/* Meta header */}
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border flex items-center gap-1 ${getSourceBadgeColor(res.chunk.source)}`}>
                            {getSourceIcon(res.chunk.source)}
                            {res.chunk.source.toUpperCase()}
                          </span>
                          <span className="font-mono text-[10px] text-muted-foreground">{res.chunk.timestamp}</span>
                        </div>

                        {/* Explainable score pill */}
                        {res.score > 0 ? (
                          <button
                            onClick={() => setExpandedScoreIdx(isExpanded ? null : index)}
                            className="px-2 py-0.5 rounded-full font-mono text-[10px] bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 font-semibold cursor-pointer transition-colors"
                            title="Inspect score calculation details"
                          >
                            Score: {res.score} {isExpanded ? '▲' : '▼'}
                          </button>
                        ) : (
                          <span className="text-[10px] text-muted-foreground font-mono">Raw Event</span>
                        )}
                      </div>

                      {/* Content block */}
                      <pre className="font-mono whitespace-pre-wrap text-[11px] leading-relaxed text-foreground bg-muted/40 p-2 rounded border border-border/40 overflow-x-auto max-h-36">
                        {res.chunk.content}
                      </pre>

                      {/* Score Explanation dropdown card */}
                      {isExpanded && res.explanations.length > 0 && (
                        <div className="bg-muted/80 border border-border p-2.5 rounded-lg space-y-2 animate-in slide-in-from-top-1.5 duration-150">
                          <div className="flex justify-between items-center border-b border-border/80 pb-1 font-semibold text-[10px]">
                            <span className="text-primary">Explainable TF-IDF Component Matrix</span>
                            <span>Boost: +{(res.metadataBoost * 100).toFixed(0)}%</span>
                          </div>
                          <div className="space-y-1.5">
                            {res.explanations.map((exp, eIdx) => (
                              <div key={eIdx} className="grid grid-cols-5 gap-1 font-mono text-[9px] border-b border-border/40 pb-1">
                                <span className="font-bold text-foreground truncate">{exp.term}</span>
                                <span>TF: {exp.tf}</span>
                                <span>IDF: {exp.idf.toFixed(2)}</span>
                                <span>LenPen: {exp.lengthPenalty.toFixed(2)}</span>
                                <span className="text-right font-bold text-primary">={exp.score.toFixed(2)}</span>
                              </div>
                            ))}
                          </div>
                          <p className="text-[9px] text-muted-foreground leading-normal">
                            * Formula: Score = &Sigma; [ IDF &times; (TF &times; 2.5) / (TF + 1.5 &times; LengthPenalty) ] &times; MetadataBoost.
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

        </div>

        {/* Right Panel: Report Automator Tabs (55%) */}
        <div className="xl:col-span-7 bg-card border border-border rounded-xl shadow-sm flex flex-col min-h-[500px]">
          
          {/* Tabs header */}
          <div className="flex border-b border-border bg-muted/10 overflow-x-auto scrollbar-none">
            {(['timeline', 'root-cause', 'impact', 'actions', 'report'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-5 py-3.5 text-xs font-semibold uppercase tracking-wider border-b-2 whitespace-nowrap cursor-pointer transition-all ${
                  activeTab === tab 
                    ? 'border-primary text-primary bg-card' 
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab.replace('-', ' ')}
              </button>
            ))}
          </div>

          {/* Tab Content body */}
          <div className="p-6 flex-1 flex flex-col">
            
            {/* TIMELINE TAB */}
            {activeTab === 'timeline' && (
              <div className="space-y-6 flex-1 flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <div>
                      <h3 className="font-semibold text-base">Reconstructed Incident Timeline</h3>
                      <p className="text-xs text-muted-foreground">Order of operational events compiled from logs and chat histories.</p>
                    </div>
                    <button
                      onClick={runGenerateTimeline}
                      disabled={isGenerating.timeline}
                      className="flex items-center gap-1.5 px-3 py-1 border border-primary/20 hover:border-primary text-primary hover:bg-primary/5 text-xs font-semibold rounded-lg transition-all cursor-pointer"
                    >
                      {isGenerating.timeline ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Parsing logs...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="h-3 w-3" />
                          AI Timeline
                        </>
                      )}
                    </button>
                  </div>

                  {/* Vertical Timeline component */}
                  {!report || report.timeline.length === 0 ? (
                    <div className="p-12 border border-dashed border-border rounded-xl text-center text-sm text-muted-foreground">
                      No timeline events resolved yet. Trigger "AI Timeline" or add events manually.
                    </div>
                  ) : (
                    <div className="relative border-l border-border pl-6 ml-3 space-y-5 py-2">
                      {report.timeline.map((event, idx) => {
                        const lineColors = {
                          info: 'bg-primary border-primary/20 text-primary-foreground',
                          warning: 'bg-yellow-500 border-yellow-500/20 text-black',
                          error: 'bg-red-500 border-red-500/20 text-white',
                          success: 'bg-green-500 border-green-500/20 text-white'
                        };

                        return (
                          <div key={idx} className="relative group">
                            {/* Bullet marker */}
                            <span className={`absolute -left-[30px] top-0.5 flex h-4.5 w-4.5 items-center justify-center rounded-full border text-[9px] font-bold shadow-sm ${lineColors[event.severity || 'info']}`}>
                              {event.severity === 'error' ? '!' : event.severity === 'success' ? '✓' : idx + 1}
                            </span>
                            
                            <div className="flex justify-between items-start gap-4">
                              <div>
                                <span className="font-mono text-xs font-bold text-foreground mr-2">{event.time}</span>
                                <span className="text-xs text-muted-foreground leading-normal">{event.event}</span>
                              </div>
                              <button 
                                onClick={() => deleteTimelineEvent(idx)}
                                className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-500/10 text-red-500 transition-all cursor-pointer"
                                title="Remove item"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Event Adder bar */}
                <div className="border-t border-border pt-4 mt-6">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Manually Append Event</h4>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      placeholder="Time (e.g. 10:22)"
                      value={newTime}
                      onChange={e => setNewTime(e.target.value)}
                      className="px-3 py-1.5 text-xs bg-background border border-input rounded-md w-full sm:w-28 focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                    <input
                      type="text"
                      placeholder="Event description..."
                      value={newEvent}
                      onChange={e => setNewEvent(e.target.value)}
                      className="px-3 py-1.5 text-xs bg-background border border-input rounded-md flex-1 focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                    <select
                      value={newSev}
                      onChange={e => setNewSev(e.target.value as any)}
                      className="px-2 py-1.5 text-xs bg-background border border-input rounded-md focus:outline-none font-semibold text-muted-foreground"
                    >
                      <option value="info">INFO</option>
                      <option value="warning">WARN</option>
                      <option value="error">ERROR</option>
                      <option value="success">RESOLVED</option>
                    </select>
                    <button
                      onClick={addTimelineEvent}
                      className="px-3 py-1.5 bg-muted hover:bg-muted-foreground hover:text-background font-semibold rounded-md transition-colors text-xs cursor-pointer shrink-0"
                    >
                      Append
                    </button>
                  </div>
                </div>

              </div>
            )}

            {/* ROOT CAUSE TAB */}
            {activeTab === 'root-cause' && (
              <div className="space-y-6 flex-1">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="font-semibold text-base">Root Cause Detection</h3>
                    <p className="text-xs text-muted-foreground">Likely triggers and primary failure vectors parsed by LLM.</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={runGenerateRootCause}
                      disabled={isGenerating.rootCause}
                      className="flex items-center gap-1.5 px-3 py-1 border border-primary/20 hover:border-primary text-primary hover:bg-primary/5 text-xs font-semibold rounded-lg transition-all cursor-pointer"
                    >
                      {isGenerating.rootCause ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Analyzing...
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-3 w-3" />
                          Detect Cause
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Primary Cause Field */}
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Primary Cause</label>
                  <input
                    type="text"
                    value={rootCauseEdit.primaryCause}
                    onChange={e => {
                      setRootCauseEdit(prev => ({ ...prev, primaryCause: e.target.value }));
                    }}
                    onBlur={saveRootCauseDetails}
                    placeholder="Enter identified primary root cause..."
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>

                {/* Contributing Factors Bullet Manager */}
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Contributing Factors</label>
                  
                  {rootCauseEdit.contributingFactors.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">No contributing factors defined yet.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {rootCauseEdit.contributingFactors.map((fact, idx) => (
                        <li key={idx} className="flex justify-between items-start gap-3 text-xs bg-muted/20 border border-border/40 p-2 rounded">
                          <span className="leading-relaxed font-medium text-foreground">&bull; {fact}</span>
                          <button
                            onClick={() => deleteRootCauseFactor(idx)}
                            className="text-red-500 hover:bg-red-500/10 p-0.5 rounded cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="flex gap-2 pt-1.5">
                    <input
                      type="text"
                      placeholder="Add contributing factor bullet..."
                      value={newFactor}
                      onChange={e => setNewFactor(e.target.value)}
                      className="px-3 py-1.5 text-xs bg-background border border-input rounded-md flex-1 focus:outline-none"
                    />
                    <button
                      onClick={addRootCauseFactor}
                      className="px-3 py-1.5 bg-muted hover:bg-muted-foreground hover:text-background font-semibold rounded-md text-xs cursor-pointer shrink-0"
                    >
                      Add Factor
                    </button>
                  </div>
                </div>

                {/* Evidence quotes references */}
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Evidence Quotes</label>
                  
                  {rootCauseEdit.evidence.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">No evidence log snippets linked.</p>
                  ) : (
                    <div className="space-y-2">
                      {rootCauseEdit.evidence.map((ev, idx) => (
                        <div key={idx} className="flex gap-2 items-start text-xs bg-violet-500/5 border border-violet-500/10 p-2 rounded">
                          <blockquote className="font-mono text-[11px] leading-relaxed text-violet-400 flex-1 border-l-2 border-violet-500/30 pl-2">
                            "{ev}"
                          </blockquote>
                          <button
                            onClick={() => deleteEvidenceQuote(idx)}
                            className="text-red-500 hover:bg-red-500/10 p-0.5 rounded cursor-pointer shrink-0"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-2 pt-1.5">
                    <input
                      type="text"
                      placeholder="Paste supporting log evidence line..."
                      value={newEvidence}
                      onChange={e => setNewEvidence(e.target.value)}
                      className="px-3 py-1.5 text-xs bg-background border border-input rounded-md flex-1 focus:outline-none"
                    />
                    <button
                      onClick={addEvidenceQuote}
                      className="px-3 py-1.5 bg-muted hover:bg-muted-foreground hover:text-background font-semibold rounded-md text-xs cursor-pointer shrink-0"
                    >
                      Link Log
                    </button>
                  </div>
                </div>

              </div>
            )}

            {/* IMPACT ANALYSIS TAB */}
            {activeTab === 'impact' && (
              <div className="space-y-6 flex-1">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="font-semibold text-base">Impact Assessment</h3>
                    <p className="text-xs text-muted-foreground">Identify microservice fallouts, user exposure metrics, and down durations.</p>
                  </div>
                  <button
                    onClick={runGenerateImpact}
                    disabled={isGenerating.impact}
                    className="flex items-center gap-1.5 px-3 py-1 border border-primary/20 hover:border-primary text-primary hover:bg-primary/5 text-xs font-semibold rounded-lg transition-all cursor-pointer"
                  >
                    {isGenerating.impact ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Calculating...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-3 w-3" />
                        Analyze Impact
                      </>
                    )}
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Users Affected */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Users Affected (Estimate)</label>
                    <input
                      type="number"
                      value={impactEdit.usersAffected || ''}
                      onChange={e => {
                        const val = parseInt(e.target.value) || 0;
                        setImpactEdit(prev => ({ ...prev, usersAffected: val }));
                      }}
                      onBlur={saveImpactDetails}
                      placeholder="e.g. 1500"
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-xs focus-visible:outline-none"
                    />
                  </div>

                  {/* Downtime Minutes */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Downtime (Minutes)</label>
                    <input
                      type="number"
                      value={impactEdit.downtimeMinutes || ''}
                      onChange={e => {
                        const val = parseInt(e.target.value) || 0;
                        setImpactEdit(prev => ({ ...prev, downtimeMinutes: val }));
                      }}
                      onBlur={saveImpactDetails}
                      placeholder="e.g. 30"
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-xs focus-visible:outline-none"
                    />
                  </div>
                </div>

                {/* Affected Services Tags */}
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Affected Services</label>
                  <div className="flex flex-wrap gap-1.5 p-2 bg-muted/20 border border-border/60 rounded-md">
                    {impactEdit.services.length === 0 ? (
                      <span className="text-xs text-muted-foreground italic">No services listed.</span>
                    ) : (
                      impactEdit.services.map((svc, idx) => (
                        <span 
                          key={idx} 
                          className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20"
                        >
                          {svc}
                          <button
                            type="button"
                            onClick={() => {
                              const updated = impactEdit.services.filter((_, i) => i !== idx);
                              setImpactEdit(prev => {
                                const nu = { ...prev, services: updated };
                                if (report) mockDb.saveReport({ ...report, impact: nu });
                                return nu;
                              });
                            }}
                            className="hover:text-red-400 transition-colors"
                          >
                            &times;
                          </button>
                        </span>
                      ))
                    )}
                  </div>

                  <div className="flex gap-2 pt-1.5">
                    <input
                      type="text"
                      id="newServiceInput"
                      placeholder="e.g. Checkout API"
                      className="px-3 py-1.5 text-xs bg-background border border-input rounded-md flex-1 focus:outline-none"
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          const val = (e.target as HTMLInputElement).value.trim();
                          if (val && !impactEdit.services.includes(val)) {
                            const updated = [...impactEdit.services, val];
                            setImpactEdit(prev => {
                              const nu = { ...prev, services: updated };
                              if (report) mockDb.saveReport({ ...report, impact: nu });
                              return nu;
                            });
                            (e.target as HTMLInputElement).value = '';
                          }
                        }
                      }}
                    />
                    <button
                      onClick={() => {
                        const el = document.getElementById('newServiceInput') as HTMLInputElement;
                        const val = el?.value.trim();
                        if (val && !impactEdit.services.includes(val)) {
                          const updated = [...impactEdit.services, val];
                          setImpactEdit(prev => {
                            const nu = { ...prev, services: updated };
                            if (report) mockDb.saveReport({ ...report, impact: nu });
                            return nu;
                          });
                          el.value = '';
                        }
                      }}
                      className="px-3 py-1.5 bg-muted hover:bg-muted-foreground hover:text-background font-semibold rounded-md text-xs cursor-pointer shrink-0"
                    >
                      Add Service
                    </button>
                  </div>
                </div>

              </div>
            )}

            {/* ACTION ITEMS TAB */}
            {activeTab === 'actions' && (
              <div className="space-y-6 flex-1">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="font-semibold text-base">Preventive Action Items</h3>
                    <p className="text-xs text-muted-foreground">Checklist of mitigation recommendations grouped by time urgency.</p>
                  </div>
                  <button
                    onClick={runGenerateActions}
                    disabled={isGenerating.actions}
                    className="flex items-center gap-1.5 px-3 py-1 border border-primary/20 hover:border-primary text-primary hover:bg-primary/5 text-xs font-semibold rounded-lg transition-all cursor-pointer"
                  >
                    {isGenerating.actions ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Thinking...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-3 w-3" />
                        AI Action Items
                      </>
                    )}
                  </button>
                </div>

                {/* Sublists */}
                {(['immediate', 'shortTerm', 'longTerm'] as const).map(type => {
                  const label = type === 'immediate' ? 'Immediate Mitigation' : type === 'shortTerm' ? 'Short-Term Prevention' : 'Long-Term Architecture';
                  const labelColor = type === 'immediate' ? 'text-red-400' : type === 'shortTerm' ? 'text-orange-400' : 'text-blue-400';
                  
                  return (
                    <div key={type} className="space-y-2.5">
                      <h4 className={`text-xs font-bold uppercase tracking-wider ${labelColor}`}>{label}</h4>
                      
                      {actionItemsEdit[type].length === 0 ? (
                        <p className="text-xs text-muted-foreground italic pl-3">No actions scheduled.</p>
                      ) : (
                        <div className="space-y-1.5 pl-2">
                          {actionItemsEdit[type].map((item, idx) => (
                            <div key={idx} className="flex justify-between items-center gap-4 text-xs group">
                              <div className="flex items-start gap-2.5">
                                <Checkbox 
                                  className="mt-0.5" 
                                  defaultChecked={false}
                                />
                                <span className="leading-relaxed text-foreground font-medium">{item}</span>
                              </div>
                              <button
                                onClick={() => deleteActionItem(type, idx)}
                                className="text-red-500 opacity-0 group-hover:opacity-100 hover:bg-red-500/10 p-0.5 rounded cursor-pointer transition-all"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Action Item Input Form */}
                <div className="border-t border-border pt-4 mt-6">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Create New Recommendation</h4>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      placeholder="Preventive task description..."
                      value={newAction.text}
                      onChange={e => setNewAction(prev => ({ ...prev, text: e.target.value }))}
                      className="px-3 py-1.5 text-xs bg-background border border-input rounded-md flex-1 focus:outline-none"
                    />
                    <select
                      value={newAction.type}
                      onChange={e => setNewAction(prev => ({ ...prev, type: e.target.value as any }))}
                      className="px-2 py-1.5 text-xs bg-background border border-input rounded-md focus:outline-none font-semibold text-muted-foreground"
                    >
                      <option value="immediate">IMMEDIATE</option>
                      <option value="shortTerm">SHORT TERM</option>
                      <option value="longTerm">LONG TERM</option>
                    </select>
                    <button
                      onClick={addActionItem}
                      className="px-3 py-1.5 bg-muted hover:bg-muted-foreground hover:text-background font-semibold rounded-md text-xs cursor-pointer shrink-0"
                    >
                      Assign Task
                    </button>
                  </div>
                </div>

              </div>
            )}

            {/* FULL REPORT MARKDOWN TAB */}
            {activeTab === 'report' && (
              <div className="space-y-6 flex-1 flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <div>
                      <h3 className="font-semibold text-base">Executive-Ready Postmortem</h3>
                      <p className="text-xs text-muted-foreground">Compiled report ready for presentation to engineering leadership.</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={handleCopyMarkdown}
                        className="flex items-center gap-1 px-3 py-1.5 border border-border hover:bg-muted text-muted-foreground hover:text-foreground text-xs font-semibold rounded-md transition-colors cursor-pointer"
                        title="Copy Markdown"
                      >
                        <Copy className="h-3.5 w-3.5" />
                        Copy MD
                      </button>
                      <button
                        onClick={handleDownloadMarkdown}
                        className="flex items-center gap-1 px-3 py-1.5 border border-border hover:bg-muted text-muted-foreground hover:text-foreground text-xs font-semibold rounded-md transition-colors cursor-pointer"
                        title="Download Markdown File"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Download
                      </button>
                    </div>
                  </div>

                  {/* Render Mock Markdown Viewer */}
                  {!report ? (
                    <div className="p-12 border border-dashed border-border rounded-xl text-center text-sm text-muted-foreground">
                      No report generated yet. Run the "AI Postmortem" synthesizer in the header to compile all segments.
                    </div>
                  ) : (
                    <div className="bg-muted/30 border border-border rounded-xl p-5 font-sans space-y-5 text-sm overflow-y-auto max-h-[500px]">
                      
                      {/* Title block */}
                      <div className="border-b border-border pb-4">
                        <h2 className="text-xl font-bold tracking-tight text-primary mb-1">Incident Postmortem Report</h2>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span>Report Generated: {new Date(report.generatedAt).toLocaleString()}</span>
                          <span>&bull;</span>
                          <span className="font-mono">Ref: {report.id}</span>
                        </div>
                      </div>

                      {/* Summary */}
                      <div className="space-y-2">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">1. Executive Summary</h4>
                        <p className="text-xs leading-relaxed text-muted-foreground">{incident.description}</p>
                      </div>

                      {/* Timeline */}
                      <div className="space-y-2">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">2. Chronological Timeline</h4>
                        <div className="border border-border rounded-lg overflow-hidden bg-card/60">
                          <table className="w-full text-left text-xs border-collapse">
                            <thead>
                              <tr className="bg-muted/55 border-b border-border font-semibold text-muted-foreground">
                                <th className="p-2 w-20">Time</th>
                                <th className="p-2">Event Description</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                              {report.timeline.map((t, idx) => (
                                <tr key={idx} className="hover:bg-muted/10 font-mono text-[11px]">
                                  <td className="p-2 font-bold">{t.time}</td>
                                  <td className="p-2 text-muted-foreground">{t.event}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* Root Cause */}
                      <div className="space-y-2">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">3. Failure Vectors & Root Cause</h4>
                        <div className="p-3.5 bg-card/80 border border-border rounded-lg space-y-2">
                          <p className="font-semibold text-xs text-foreground">{report.rootCause.primaryCause}</p>
                          <div className="space-y-1">
                            <span className="text-[10px] font-bold text-muted-foreground block uppercase">Contributing Factors:</span>
                            {report.rootCause.contributingFactors.map((f, idx) => (
                              <p key={idx} className="text-xs text-muted-foreground pl-2 leading-relaxed">&bull; {f}</p>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Impact */}
                      <div className="space-y-2">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">4. Blast Radius & Impact Analysis</h4>
                        <div className="grid grid-cols-3 gap-3">
                          <div className="bg-card/80 border border-border rounded-lg p-2.5 text-center">
                            <p className="text-[10px] text-muted-foreground font-semibold uppercase">Services</p>
                            <p className="text-xs font-bold truncate mt-1 text-primary">{report.impact.services.join(', ')}</p>
                          </div>
                          <div className="bg-card/80 border border-border rounded-lg p-2.5 text-center">
                            <p className="text-[10px] text-muted-foreground font-semibold uppercase">Users Affected</p>
                            <p className="text-xs font-bold mt-1">{report.impact.usersAffected.toLocaleString()}</p>
                          </div>
                          <div className="bg-card/80 border border-border rounded-lg p-2.5 text-center">
                            <p className="text-[10px] text-muted-foreground font-semibold uppercase">Downtime</p>
                            <p className="text-xs font-bold mt-1 text-red-400">{report.impact.downtimeMinutes}m</p>
                          </div>
                        </div>
                      </div>

                      {/* Action items */}
                      <div className="space-y-2">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">5. Preventive Actions</h4>
                        <div className="space-y-2">
                          {report.actionItems.immediate.length > 0 && (
                            <div className="pl-2">
                              <span className="text-[10px] font-bold text-red-400 uppercase">Immediate mitigation:</span>
                              {report.actionItems.immediate.map((a, idx) => (
                                <p key={idx} className="text-xs text-muted-foreground mt-0.5">&bull; [ ] {a}</p>
                              ))}
                            </div>
                          )}
                          {report.actionItems.shortTerm.length > 0 && (
                            <div className="pl-2">
                              <span className="text-[10px] font-bold text-orange-400 uppercase">Short-term prevention:</span>
                              {report.actionItems.shortTerm.map((a, idx) => (
                                <p key={idx} className="text-xs text-muted-foreground mt-0.5">&bull; [ ] {a}</p>
                              ))}
                            </div>
                          )}
                          {report.actionItems.longTerm.length > 0 && (
                            <div className="pl-2">
                              <span className="text-[10px] font-bold text-blue-400 uppercase">Long-term architecture:</span>
                              {report.actionItems.longTerm.map((a, idx) => (
                                <p key={idx} className="text-xs text-muted-foreground mt-0.5">&bull; [ ] {a}</p>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                    </div>
                  )}
                </div>
              </div>
            )}

          </div>

        </div>

      </div>

    </div>
  );
}
