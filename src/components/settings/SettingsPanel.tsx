import React, { useState } from 'react';
import { getStoredApiKey, setStoredApiKey } from '../../lib/gemini/client';
import { mockDb } from '../../lib/db/mockDb';
import { Key, Save, Trash2, Database, AlertCircle, CheckCircle2, ShieldAlert, Cpu } from 'lucide-react';

export default function SettingsPanel() {
  const [apiKey, setApiKey] = useState(() => getStoredApiKey());
  const [isSaved, setIsSaved] = useState(false);
  const [hfToken, setHfToken] = useState(() => localStorage.getItem('opsium_hf_token') || '');
  const [isHfSaved, setIsHfSaved] = useState(false);
  const [alertMsg, setAlertMsg] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setStoredApiKey(apiKey.trim());
    setIsSaved(true);
    triggerAlert('success', 'Gemini API credentials successfully saved to browser local storage.');
    setTimeout(() => setIsSaved(false), 3000);
  };

  const handleClear = () => {
    setStoredApiKey('');
    setApiKey('');
    triggerAlert('success', 'Gemini API key removed.');
  };

  const handleSaveHf = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('opsium_hf_token', hfToken.trim());
    setIsHfSaved(true);
    triggerAlert('success', 'Hugging Face API Token successfully saved to browser local storage.');
    setTimeout(() => setIsHfSaved(false), 3000);
  };

  const handleClearHf = () => {
    localStorage.removeItem('opsium_hf_token');
    setHfToken('');
    triggerAlert('success', 'Hugging Face API Token removed.');
  };

  const handleResetDb = () => {
    if (window.confirm('This will wipe all custom incidents, uploads, and reports, and restore the preseeded Postgres Pool Outage dataset. Proceed?')) {
      mockDb.resetDb();
      triggerAlert('success', 'Local database has been re-seeded and restored to default values.');
    }
  };

  const triggerAlert = (type: 'success' | 'error', text: string) => {
    setAlertMsg({ type, text });
    setTimeout(() => setAlertMsg(null), 5000);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Configuration Panel</h2>
        <p className="text-sm text-muted-foreground">Adjust Gemini API settings, clear browser databases, or inspect architecture limits.</p>
      </div>

      {alertMsg && (
        <div className={`p-4 rounded-lg border text-sm flex items-center gap-3 animate-in slide-in-from-top-3 ${
          alertMsg.type === 'success' 
            ? 'bg-green-500/10 border-green-500/20 text-green-400' 
            : 'bg-red-500/10 border-red-500/20 text-red-400'
        }`}>
          {alertMsg.type === 'success' ? <CheckCircle2 className="h-5 w-5 shrink-0" /> : <AlertCircle className="h-5 w-5 shrink-0" />}
          <span>{alertMsg.text}</span>
        </div>
      )}

      {/* API Configuration Card */}
      <div className="bg-card text-card-foreground border border-border rounded-xl shadow-sm overflow-hidden">
        <div className="p-6 border-b border-border bg-muted/10 flex items-center gap-3">
          <Key className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-lg">Gemini Intelligence Orchestration</h3>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-sm text-muted-foreground leading-relaxed">
            Opsium uses <strong>Gemini 2.5 Pro / Flash</strong> to automatically synthesize retrieved evidence log chunks into postmortem sections. 
            Enter your Gemini API key below to enable live generation. If left blank, Opsium automatically falls back to offline keyword-based analysis heuristics.
          </p>

          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none">Gemini API Key</label>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  placeholder="AIzaSy..."
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 flex-1"
                />
                {apiKey && (
                  <button
                    type="button"
                    onClick={handleClear}
                    className="p-2 border border-border rounded-lg text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
                    title="Remove API Key"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                )}
              </div>
            </div>

            <button
              type="submit"
              className="flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/95 active:scale-[0.98] transition-all cursor-pointer text-sm"
            >
              <Save className="h-4 w-4" />
              {isSaved ? 'Credentials Saved!' : 'Save Credentials'}
            </button>
          </form>
        </div>
      </div>

      {/* Hugging Face Vector Configuration Card */}
      <div className="bg-card text-card-foreground border border-border rounded-xl shadow-sm overflow-hidden">
        <div className="p-6 border-b border-border bg-muted/10 flex items-center gap-3">
          <Cpu className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-lg">Hugging Face Semantic Embeddings</h3>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-sm text-muted-foreground leading-relaxed">
            Opsium integrates with <strong>LangChain's MemoryVectorStore</strong> and <strong>Hugging Face's Sentence-Transformers</strong> for vector semantic similarity search. 
            Enter your Hugging Face API Token below to enable live embedding generation. If left blank, Opsium uses local deterministic vector hashing.
          </p>

          <form onSubmit={handleSaveHf} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none">Hugging Face API Token</label>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={hfToken}
                  onChange={e => setHfToken(e.target.value)}
                  placeholder="hf_..."
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 flex-1"
                />
                {hfToken && (
                  <button
                    type="button"
                    onClick={handleClearHf}
                    className="p-2 border border-border rounded-lg text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
                    title="Remove Token"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                )}
              </div>
            </div>

            <button
              type="submit"
              className="flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/95 active:scale-[0.98] transition-all cursor-pointer text-sm"
            >
              <Save className="h-4 w-4" />
              {isHfSaved ? 'Token Saved!' : 'Save Token'}
            </button>
          </form>
        </div>
      </div>

      {/* Database Maintenance Card */}
      <div className="bg-card text-card-foreground border border-border rounded-xl shadow-sm overflow-hidden">
        <div className="p-6 border-b border-border bg-muted/10 flex items-center gap-3">
          <Database className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-lg">Local Database Maintenance</h3>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-sm text-muted-foreground leading-relaxed">
            All incidents, documents, text chunks, and generated postmortems are stored inside your browser's <code>localStorage</code>.
            If the data grows too large, or if you want to restore the defaults, trigger a database reset.
          </p>

          <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-yellow-500/90 text-sm flex items-start gap-3">
            <ShieldAlert className="h-5 w-5 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">Caution</span>: Resetting will permanently delete all logs you have uploaded and custom reports you generated.
            </div>
          </div>

          <button
            onClick={handleResetDb}
            className="flex items-center justify-center gap-2 px-4 py-2 border border-red-500/30 hover:border-red-500 bg-red-500/5 hover:bg-red-500/10 text-red-400 font-semibold rounded-lg transition-colors cursor-pointer text-sm"
          >
            <Database className="h-4 w-4" />
            Reset & Re-seed Database
          </button>
        </div>
      </div>

      {/* RAG Framework Explanation Card */}
      <div className="p-6 border border-border bg-muted/40 rounded-xl space-y-3">
        <h4 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">Architectural Note: Why BM25?</h4>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Vectorless RAG offers massive speed advantages when parsing SRE data. Logs, JSON dumps, and Slack lists are highly keyword-dense.
          By parsing these streams into semantic timestamped chunks, building index term lists, and querying them using the BM25 formula, we get explainable, accurate SRE context retrieval without the high latency and cost of third-party Vector Databases.
        </p>
      </div>

    </div>
  );
}
