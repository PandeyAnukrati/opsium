import { useState, useEffect } from 'react';
import { mockDb, type Incident } from '../../lib/db/mockDb';
import CreateIncidentModal from '../incident/CreateIncidentModal';
import { 
  Plus, Search, ShieldAlert, CheckCircle, Clock, AlertTriangle, 
  Activity, ArrowUpRight, Filter, ChevronRight, ChevronDown
} from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '../ui/dropdown-menu';

interface DashboardHomeProps {
  onSelectIncident: (id: string) => void;
}

export default function DashboardHome({ onSelectIncident }: DashboardHomeProps) {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [search, setSearch] = useState('');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [isModalOpen, setIsModalOpen] = useState(false);

  const refreshData = () => {
    setIncidents(mockDb.getIncidents());
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      refreshData();
    }, 0);
    window.addEventListener('opsium_db_sync', refreshData);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('opsium_db_sync', refreshData);
    };
  }, []);

  // Metrics calculations
  const total = incidents.length;
  const active = incidents.filter(i => i.status !== 'RESOLVED').length;
  
  // Custom mock charts data matching dates
  const chartData = [
    { date: 'Jun 01', volume: 2, mttr: 42 },
    { date: 'Jun 02', volume: 5, mttr: 35 },
    { date: 'Jun 03', volume: 3, mttr: 29 },
    { date: 'Jun 04', volume: 4, mttr: 48 },
    { date: 'Jun 05', volume: 1, mttr: 18 },
    { date: 'Jun 06', volume: 6, mttr: 31 },
    { date: 'Jun 07', volume: total, mttr: 24 }
  ];

  // Filters
  const filteredIncidents = incidents.filter(inc => {
    const matchesSearch = inc.title.toLowerCase().includes(search.toLowerCase()) || 
                          inc.description.toLowerCase().includes(search.toLowerCase());
    const matchesSeverity = selectedSeverity === 'ALL' || inc.severity === selectedSeverity;
    const matchesStatus = selectedStatus === 'ALL' || inc.status === selectedStatus;
    return matchesSearch && matchesSeverity && matchesStatus;
  });

  const getSeverityStyles = (sev: Incident['severity']) => {
    switch (sev) {
      case 'CRITICAL':
        return 'bg-red-500/10 text-red-500 border-red-500/20';
      case 'HIGH':
        return 'bg-orange-500/10 text-orange-500 border-orange-500/20';
      case 'MEDIUM':
        return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
      case 'LOW':
        return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
    }
  };

  const getStatusStyles = (status: Incident['status']) => {
    switch (status) {
      case 'ACTIVE':
        return 'bg-red-500/10 text-red-400 border-red-500/20';
      case 'INVESTIGATING':
        return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
      case 'IDENTIFIED':
        return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
      case 'MITIGATED':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      case 'RESOLVED':
        return 'bg-green-500/10 text-green-400 border-green-500/20';
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Upper Action Bar */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Incident Intelligence Hub</h2>
          <p className="text-sm text-muted-foreground">Monitor real-time system stability, query logs, and trigger automated postmortems.</p>
        </div>
        <button
          id="tutorial-dashboard-declare"
          onClick={() => setIsModalOpen(true)}
          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 active:scale-[0.98] transition-all duration-150 shadow-md cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          Declare Outage
        </button>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Metric 1 */}
        <div className="bg-card text-card-foreground border border-border rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total Incidents</p>
              <h3 className="text-3xl font-bold mt-2">{total}</h3>
            </div>
            <div className="p-2.5 rounded-lg bg-primary/10 text-primary">
              <Activity className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4 flex items-center text-xs text-green-500">
            <span>+12% from last week</span>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary scale-x-0 group-hover:scale-x-100 transition-transform origin-left" />
        </div>

        {/* Metric 2 */}
        <div className="bg-card text-card-foreground border border-border rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Active Outages</p>
              <h3 className="text-3xl font-bold mt-2">{active}</h3>
            </div>
            <div className="p-2.5 rounded-lg bg-red-500/10 text-red-500">
              <ShieldAlert className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4 flex items-center text-xs text-muted-foreground">
            <span>{active > 0 ? 'Requires attention' : 'Systems operational'}</span>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-red-500 scale-x-0 group-hover:scale-x-100 transition-transform origin-left" />
        </div>

        {/* Metric 3 */}
        <div className="bg-card text-card-foreground border border-border rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">MTTR (Average)</p>
              <h3 className="text-3xl font-bold mt-2">31m</h3>
            </div>
            <div className="p-2.5 rounded-lg bg-blue-500/10 text-blue-500">
              <Clock className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4 flex items-center text-xs text-green-500">
            <span>-14% decrease (Faster resolution)</span>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-blue-500 scale-x-0 group-hover:scale-x-100 transition-transform origin-left" />
        </div>

        {/* Metric 4 */}
        <div className="bg-card text-card-foreground border border-border rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">SLA Compliance</p>
              <h3 className="text-3xl font-bold mt-2">99.94%</h3>
            </div>
            <div className="p-2.5 rounded-lg bg-green-500/10 text-green-500">
              <CheckCircle className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4 flex items-center text-xs text-green-500">
            <span>Above threshold (99.9%)</span>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-green-500 scale-x-0 group-hover:scale-x-100 transition-transform origin-left" />
        </div>
      </div>

      {/* Grid for Chart & Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Visual Chart */}
        <div className="lg:col-span-2 bg-card border border-border rounded-xl p-5 shadow-sm flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold tracking-tight">Incident Volume & MTTR Trend</h3>
            <span className="text-xs text-muted-foreground">Last 7 Days</span>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorVolume" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" stroke="oklch(0.553 0.013 58.071)" fontSize={11} />
                <YAxis stroke="oklch(0.553 0.013 58.071)" fontSize={11} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'var(--color-card)', 
                    borderColor: 'var(--color-border)',
                    borderRadius: '8px'
                  }}
                  labelStyle={{ color: 'var(--color-foreground)', fontWeight: 'bold' }}
                />
                <Area type="monotone" dataKey="volume" stroke="var(--color-primary)" strokeWidth={2.5} fillOpacity={1} fill="url(#colorVolume)" name="Incidents" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Explainable RAG Info Block */}
        <div className="bg-gradient-to-br from-card to-muted/40 border border-border rounded-xl p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-primary font-bold text-sm uppercase tracking-wider mb-3">
              <Plus className="h-4 w-4" />
              Vectorless RAG Architecture
            </div>
            <h4 className="text-base font-semibold tracking-tight mb-2">BM25 / TF-IDF Keyword Retrieval</h4>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Opsium bypasses heavy Vector Databases. It tokenizes, expands, and ranks your logs, Jira tickets, and Slack messages in browser memory using BM25, applying metadata boosts to critical error patterns.
            </p>
            <div className="mt-4 space-y-2.5">
              <div className="flex justify-between items-center text-xs border-b border-border/60 pb-1.5">
                <span className="text-muted-foreground">Retrieval Cost</span>
                <span className="font-semibold text-green-500">Free / $0.00</span>
              </div>
              <div className="flex justify-between items-center text-xs border-b border-border/60 pb-1.5">
                <span className="text-muted-foreground">Index Latency</span>
                <span className="font-semibold text-green-500">&lt; 50ms</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground">Dependency footprint</span>
                <span className="font-semibold text-yellow-500">None (Pure Javascript)</span>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-border flex items-center justify-between text-xs text-primary font-medium">
            <span>Learn how ranking scoring works</span>
            <ArrowUpRight className="h-4 w-4" />
          </div>
        </div>
      </div>

      {/* Incident List Table Area */}
      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        {/* Table Filter Header */}
        <div className="p-5 border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-4 bg-muted/10">
          <h3 className="text-lg font-semibold tracking-tight">Recent Incidents</h3>
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4.5 w-4.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search incidents..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 pr-4 py-2 w-full sm:w-60 text-sm bg-background border border-input rounded-lg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>

            {/* Severity Filter */}
            <div className="flex items-center gap-1.5 bg-background border border-input rounded-lg px-2.5 py-1.5 text-sm font-semibold select-none">
              <Filter className="h-3.5 w-3.5 text-muted-foreground" />
              <DropdownMenu>
                <DropdownMenuTrigger className="flex items-center gap-1 text-xs font-bold text-primary focus:outline-none uppercase cursor-pointer hover:opacity-85">
                  {selectedSeverity === 'ALL' ? 'All Severities' : selectedSeverity}
                  <ChevronDown className="h-3.5 w-3.5 text-primary" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-popover border border-border text-popover-foreground">
                  <DropdownMenuItem onClick={() => setSelectedSeverity('ALL')} className="uppercase font-semibold cursor-pointer">
                    All Severities
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSelectedSeverity('CRITICAL')} className="uppercase font-semibold cursor-pointer">
                    Critical
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSelectedSeverity('HIGH')} className="uppercase font-semibold cursor-pointer">
                    High
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSelectedSeverity('MEDIUM')} className="uppercase font-semibold cursor-pointer">
                    Medium
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSelectedSeverity('LOW')} className="uppercase font-semibold cursor-pointer">
                    Low
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-1.5 bg-background border border-input rounded-lg px-2.5 py-1.5 text-sm font-semibold select-none">
              <Filter className="h-3.5 w-3.5 text-muted-foreground" />
              <DropdownMenu>
                <DropdownMenuTrigger className="flex items-center gap-1 text-xs font-bold text-primary focus:outline-none uppercase cursor-pointer hover:opacity-85">
                  {selectedStatus === 'ALL' ? 'All Statuses' : selectedStatus}
                  <ChevronDown className="h-3.5 w-3.5 text-primary" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-popover border border-border text-popover-foreground">
                  <DropdownMenuItem onClick={() => setSelectedStatus('ALL')} className="uppercase font-semibold cursor-pointer">
                    All Statuses
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSelectedStatus('ACTIVE')} className="uppercase font-semibold cursor-pointer">
                    Active
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSelectedStatus('INVESTIGATING')} className="uppercase font-semibold cursor-pointer">
                    Investigating
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSelectedStatus('IDENTIFIED')} className="uppercase font-semibold cursor-pointer">
                    Identified
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSelectedStatus('MITIGATED')} className="uppercase font-semibold cursor-pointer">
                    Mitigated
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSelectedStatus('RESOLVED')} className="uppercase font-semibold cursor-pointer">
                    Resolved
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        {/* Table Grid */}
        <div className="overflow-x-auto">
          {filteredIncidents.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <AlertTriangle className="h-10 w-10 text-muted-foreground/60 mx-auto mb-3" />
              <p className="text-sm">No incidents matched your query filter.</p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border text-xs font-semibold uppercase tracking-wider text-muted-foreground bg-muted/30">
                  <th className="p-4">Incident</th>
                  <th className="p-4">Severity</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Declared At</th>
                  <th className="p-4">Assigned Team</th>
                  <th className="p-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredIncidents.map(inc => (
                  <tr 
                    key={inc.id}
                    onClick={() => onSelectIncident(inc.id)}
                    className="hover:bg-muted/40 cursor-pointer transition-colors group"
                  >
                    <td className="p-4 min-w-[280px]">
                      <p className="font-semibold text-sm group-hover:text-primary transition-colors">{inc.title}</p>
                      <p className="text-xs text-muted-foreground truncate max-w-sm mt-1">{inc.description}</p>
                    </td>
                    <td className="p-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold border ${getSeverityStyles(inc.severity)}`}>
                        {inc.severity}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${getStatusStyles(inc.status)}`}>
                        {inc.status}
                      </span>
                    </td>
                    <td className="p-4 text-xs text-muted-foreground">
                      {new Date(inc.createdAt).toLocaleString()}
                    </td>
                    <td className="p-4 text-xs font-medium">
                      {inc.createdBy}
                    </td>
                    <td className="p-4 text-right">
                      <button className="p-1 rounded-md group-hover:bg-primary group-hover:text-primary-foreground text-muted-foreground transition-all cursor-pointer">
                        <ChevronRight className="h-4.5 w-4.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Declarer Dialog */}
      <CreateIncidentModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)}
        onSuccess={(id) => {
          refreshData();
          onSelectIncident(id);
        }}
      />
    </div>
  );
}
