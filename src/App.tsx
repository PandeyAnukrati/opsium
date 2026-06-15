import { useState, useEffect } from 'react';
import { useTheme } from './components/theme-provider';
import DashboardHome from './components/dashboard/DashboardHome';
import SettingsPanel from './components/settings/SettingsPanel';
import IncidentWorkspace from './components/incident/IncidentWorkspace';
import AuthPage from './components/auth/AuthPage';
import DashboardTutorial from './components/dashboard/DashboardTutorial';
import { mockDb, type Incident } from './lib/db/mockDb';
import { 
  LayoutDashboard, Settings, ShieldCheck, 
  Sun, Moon, Clock, Flame, HelpCircle, LogOut
} from 'lucide-react';
import { auth } from './lib/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';

export function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<{ email: string; displayName?: string; photoURL?: string; orgName?: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'settings' | 'workspace'>('dashboard');
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const { theme, setTheme } = useTheme();
  const [activeIncidents, setActiveIncidents] = useState<Incident[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showTutorial, setShowTutorial] = useState(false);

  const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  // Check if onboarding tutorial is needed
  useEffect(() => {
    if (isAuthenticated) {
      const completed = localStorage.getItem('opsium_tutorial_completed');
      if (!completed) {
        // Wait a brief moment to ensure elements are fully rendered before showing the spotlight
        const timer = setTimeout(() => {
          setShowTutorial(true);
        }, 500);
        return () => clearTimeout(timer);
      }
    } else {
      const timer = setTimeout(() => {
        setShowTutorial(false);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [isAuthenticated]);

  // Monitor Firebase Auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        setUser({
          email: firebaseUser.email || '',
          displayName: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Operator',
          photoURL: firebaseUser.photoURL || undefined,
          orgName: localStorage.getItem('opsium_org_name') || 'Google SRE Org'
        });
        setIsAuthenticated(true);
      } else {
        setUser(null);
        setIsAuthenticated(false);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    
    const refreshIncidents = () => {
      setActiveIncidents(mockDb.getIncidents().filter(i => i.status !== 'RESOLVED'));
    };

    refreshIncidents();
    window.addEventListener('opsium_db_sync', refreshIncidents);
    
    // Live clock for UTC/Local tracking
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    
    return () => {
      clearInterval(timer);
      window.removeEventListener('opsium_db_sync', refreshIncidents);
    };
  }, [activeTab, selectedIncidentId, isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <AuthPage 
        onLoginSuccess={(_, orgName) => {
          localStorage.setItem('opsium_org_name', orgName);
        }} 
      />
    );
  }

  const selectIncident = (id: string) => {
    setSelectedIncidentId(id);
    setActiveTab('workspace');
  };

  const backToDashboard = () => {
    setSelectedIncidentId(null);
    setActiveTab('dashboard');
  };

  const getSeverityColor = (sev: Incident['severity']) => {
    switch (sev) {
      case 'CRITICAL': return 'bg-red-500';
      case 'HIGH': return 'bg-orange-500';
      case 'MEDIUM': return 'bg-yellow-500';
      case 'LOW': return 'bg-blue-500';
    }
  };

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden font-sans select-none">
      
      {/* Sidebar (Navigation Panel) */}
      <aside className="w-64 border-r border-border bg-sidebar text-sidebar-foreground flex flex-col shrink-0">
        
        {/* Brand Logo Header */}
        <div className="p-5 border-b border-sidebar-border flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded bg-primary text-black font-mono text-sm font-bold shadow-sm shadow-primary/20">
            O
          </div>
          <div>
            <h1 className="font-extrabold text-lg tracking-tight leading-none text-white">Opsium</h1>
            <span className="text-[9px] text-primary font-mono uppercase tracking-wider font-semibold">Postmortem Automation</span>
          </div>
        </div>

        {/* Main Nav Items */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          <div className="space-y-1">
            <button
              id="tutorial-sidebar-hub"
              onClick={backToDashboard}
              className={`flex w-full items-center gap-3 px-3.5 py-2.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                activeTab === 'dashboard'
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground font-bold border-l-2 border-primary pl-3'
                  : 'text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground'
              }`}
            >
              <LayoutDashboard className="h-4.5 w-4.5" />
              Incident Hub
            </button>
            <button
              id="tutorial-sidebar-settings"
              onClick={() => {
                setSelectedIncidentId(null);
                setActiveTab('settings');
              }}
              className={`flex w-full items-center gap-3 px-3.5 py-2.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                activeTab === 'settings'
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground font-bold border-l-2 border-primary pl-3'
                  : 'text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground'
              }`}
            >
              <Settings className="h-4.5 w-4.5" />
              Settings & Keys
            </button>
          </div>

          {/* Active Incidents Quick Links (Sidebar Widget) */}
          <div className="pt-6 space-y-2">
            <h3 className="px-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Flame className="h-3.5 w-3.5 text-orange-500" />
              Ongoing Outages ({activeIncidents.length})
            </h3>
            {activeIncidents.length === 0 ? (
              <div className="px-3 py-2 text-[11px] text-muted-foreground italic flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-green-500" />
                All services operational
              </div>
            ) : (
              <div className="space-y-1">
                {activeIncidents.map(inc => (
                  <button
                    key={inc.id}
                    onClick={() => selectIncident(inc.id)}
                    className={`flex w-full items-center gap-2.5 px-3 py-2 text-[11px] font-medium rounded-lg text-left truncate transition-colors cursor-pointer ${
                      selectedIncidentId === inc.id && activeTab === 'workspace'
                        ? 'bg-sidebar-accent/80 text-sidebar-accent-foreground font-bold'
                        : 'text-muted-foreground hover:bg-sidebar-accent/30 hover:text-foreground'
                    }`}
                  >
                    <span className={`h-2 w-2 rounded-full shrink-0 ${getSeverityColor(inc.severity)}`} />
                    <span className="truncate flex-1">{inc.title}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </nav>

        {/* Footer Organization Context */}
        <div className="p-4 border-t border-sidebar-border bg-muted/20 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            {user?.photoURL ? (
              <img src={user.photoURL} alt={user.displayName} className="h-7 w-7 rounded-full object-cover shrink-0" />
            ) : (
              <div className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                {user?.displayName?.charAt(0).toUpperCase() || 'U'}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-xs font-semibold truncate leading-none">{user?.displayName || 'Operator'}</p>
              <span className="text-[9px] text-muted-foreground truncate block max-w-[120px]">{user?.orgName || 'Global SRE Ops'}</span>
            </div>
          </div>
          <HelpCircle className="h-4 w-4 text-muted-foreground hover:text-foreground cursor-pointer" />
        </div>
      </aside>

      {/* Main Workspace Frame */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        
        {/* Top Header / Status bar */}
        <header className="h-14 border-b border-border bg-card flex items-center justify-between px-6 shrink-0 z-10 shadow-sm">
          {/* SRE Context Clock Widget */}
          <div id="tutorial-header-clock" className="flex items-center gap-4 text-xs font-mono text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Clock className="h-4 w-4" />
              <span>LOCAL: {currentTime.toLocaleTimeString()}</span>
            </div>
            <div className="hidden sm:flex items-center gap-1.5 border-l border-border pl-4">
              <span>UTC: {new Date().toUTCString().slice(17, 25)}</span>
            </div>
          </div>

          {/* User Controls */}
          <div className="flex items-center gap-3">
            {/* Dark Mode toggle */}
            <button
              onClick={() => setTheme(isDark ? 'light' : 'dark')}
              className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-all cursor-pointer"
              title="Toggle theme"
            >
              {isDark ? <Sun className="h-4.5 w-4.5" /> : <Moon className="h-4.5 w-4.5" />}
            </button>

            {/* Profile */}
            <div id="tutorial-header-profile" className="flex items-center gap-2 border-l border-border pl-3">
              {user?.photoURL ? (
                <img src={user.photoURL} alt={user.displayName} className="h-7 w-7 rounded-full object-cover border border-border shrink-0" />
              ) : (
                <div className="h-7 w-7 rounded-full bg-muted border border-border flex items-center justify-center text-muted-foreground font-semibold text-xs shrink-0">
                  {user?.displayName?.charAt(0).toUpperCase() || 'U'}
                </div>
              )}
              <button
                onClick={() => signOut(auth)}
                className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-all cursor-pointer"
                title="Logout"
              >
                <LogOut className="h-4.5 w-4.5" />
              </button>
            </div>
          </div>
        </header>

        {/* Content Mounting Area */}
        <main className="flex-1 overflow-y-auto p-6 bg-background/95">
          {activeTab === 'dashboard' && (
            <DashboardHome onSelectIncident={selectIncident} />
          )}
          {activeTab === 'settings' && (
            <SettingsPanel />
          )}
          {activeTab === 'workspace' && selectedIncidentId && (
            <IncidentWorkspace 
              incidentId={selectedIncidentId} 
              onBackToDashboard={backToDashboard} 
            />
          )}
        </main>

      </div>

      {showTutorial && <DashboardTutorial onClose={() => setShowTutorial(false)} />}

    </div>
  );
}

export default App;
