/* eslint-disable */
import { useState, useEffect, useRef } from 'react';
import { ArrowRight, Lock, Mail, Globe } from 'lucide-react';
import { auth, googleProvider } from '../../lib/firebase';
import { signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';

interface AuthPageProps {
  onLoginSuccess: (email: string, orgName: string) => void;
}

interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  isAlert: boolean;
  pulseRadius: number;
  pulseDirection: number;
}

export default function AuthPage({ onLoginSuccess }: AuthPageProps) {
  const [email, setEmail] = useState('sre@opsium.io');
  const [orgName, setOrgName] = useState('Global SRE Ops');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: -1000, y: -1000 });

  // Canvas Network Animation Logic
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let rect = canvas.getBoundingClientRect();
    let width = (canvas.width = rect.width || window.innerWidth / 2);
    let height = (canvas.height = rect.height || window.innerHeight);

    // Resize handler
    const handleResize = () => {
      if (!canvas) return;
      const r = canvas.getBoundingClientRect();
      width = canvas.width = r.width || window.innerWidth / 2;
      height = canvas.height = r.height || window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    // Initialize Nodes
    const nodesCount = 65;
    const nodes: Node[] = [];
    for (let i = 0; i < nodesCount; i++) {
      nodes.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.8,
        vy: (Math.random() - 0.5) * 0.8,
        radius: Math.random() * 2 + 1.5,
        isAlert: Math.random() > 0.92, // Trigger red warning nodes
        pulseRadius: 0,
        pulseDirection: 1
      });
    }

    const mouse = mouseRef.current;
    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
    };

    const handleMouseLeave = () => {
      mouse.x = -1000;
      mouse.y = -1000;
    };

    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseleave', handleMouseLeave);

    // Main Draw loop
    const render = () => {
      ctx.clearRect(0, 0, width, height);

      // Gradient background
      const grad = ctx.createLinearGradient(0, 0, width, height);
      grad.addColorStop(0, '#0a0a0f');
      grad.addColorStop(1, '#11111b');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      // Subtle cybernetic grid lines
      ctx.strokeStyle = 'rgba(99, 102, 241, 0.03)';
      ctx.lineWidth = 1;
      const gridSize = 40;
      for (let x = 0; x < width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Draw connection links between close nodes
      for (let i = 0; i < nodesCount; i++) {
        const n1 = nodes[i];
        for (let j = i + 1; j < nodesCount; j++) {
          const n2 = nodes[j];
          const dx = n1.x - n2.x;
          const dy = n1.y - n2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 110) {
            const opacity = (1.0 - dist / 110) * 0.22;
            ctx.strokeStyle = n1.isAlert || n2.isAlert 
              ? `rgba(153, 27, 27, ${opacity * 1.8})` 
              : `rgba(49, 46, 129, ${opacity * 1.6})`;
            ctx.lineWidth = 0.9;
            ctx.beginPath();
            ctx.moveTo(n1.x, n1.y);
            ctx.lineTo(n2.x, n2.y);
            ctx.stroke();
          }
        }
      }

      // Draw mouse connection links
      if (mouse.x > -1000) {
        for (let i = 0; i < nodesCount; i++) {
          const node = nodes[i];
          const dx = node.x - mouse.x;
          const dy = node.y - mouse.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 140) {
            const opacity = (1.0 - dist / 140) * 0.55;
            ctx.strokeStyle = `rgba(234, 88, 12, ${opacity})`;
            ctx.lineWidth = 2.0;
            ctx.beginPath();
            ctx.moveTo(node.x, node.y);
            ctx.lineTo(mouse.x, mouse.y);
            ctx.stroke();
          }
        }
      }

      // Update and Draw nodes
      nodes.forEach((node) => {
        // Move node
        node.x += node.vx;
        node.y += node.vy;

        // Bounce on borders
        if (node.x < 0 || node.x > width) node.vx *= -1;
        if (node.y < 0 || node.y > height) node.vy *= -1;

        // Draw node
        ctx.fillStyle = node.isAlert ? '#ef4444' : '#f97316';
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        ctx.fill();

        // Glow effect for warning/alert nodes
        if (node.isAlert) {
          node.pulseRadius += 0.18 * node.pulseDirection;
          if (node.pulseRadius > 12 || node.pulseRadius < 0) {
            node.pulseDirection *= -1;
          }
          ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(node.x, node.y, node.radius + node.pulseRadius, 0, Math.PI * 2);
          ctx.stroke();
        }
      });

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !orgName) return;

    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      const pwd = password || 'defaultPassword123!';
      try {
        await signInWithEmailAndPassword(auth, email, pwd);
      } catch (err: any) {
        if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential' || err.code === 'auth/invalid-email') {
          await createUserWithEmailAndPassword(auth, email, pwd);
        } else {
          throw err;
        }
      }
      onLoginSuccess(email, orgName);
    } catch (err: any) {
      console.error('Email Auth Error:', err);
      setErrorMsg(err.message || 'Failed to authenticate SRE Console');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      onLoginSuccess(user.email || 'sre@opsium.io', 'Google SRE Org');
    } catch (err: any) {
      console.error('Google Sign-In Error:', err);
      setErrorMsg(err.message || 'Google Authentication failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex h-screen w-screen bg-[#07070a] text-foreground font-sans overflow-hidden">
      
      {/* Left Panel: Minimalist credentials auth form (50%) */}
      <div className="w-full lg:w-1/2 flex flex-col justify-between p-8 sm:p-12 md:p-16 z-10 bg-[#07070a]/95 backdrop-blur-md relative border-r border-border/40">
        
        {/* Glow decoration */}
        <div className="absolute top-[-10%] left-[-15%] w-96 h-96 bg-primary/10 rounded-full blur-3xl opacity-60 pointer-events-none" />

        {/* Top Header */}
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded bg-primary text-[#07070a] font-mono text-sm font-bold shadow-sm shadow-primary/20">
            O
          </div>
          <div>
            <h1 className="font-extrabold text-lg tracking-tight leading-none text-white">Opsium</h1>
            <span className="text-[9px] text-primary font-mono uppercase tracking-wider font-bold">Incident Intelligence</span>
          </div>
        </div>

        {/* Login Form Frame */}
        <div className="max-w-md w-full mx-auto space-y-7 my-auto">
          <div className="space-y-2">
            <h2 className="text-3xl font-extrabold tracking-tight text-white">Access Console</h2>
            <p className="text-sm text-slate-400 leading-relaxed">
              Login to inspect ongoing microservice failures and generate AI-powered postmortem timelines.
            </p>
            {errorMsg && (
              <div className="p-3.5 bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-lg flex items-center gap-2.5 animate-in fade-in slide-in-from-top-2 duration-300">
                <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse shrink-0" />
                <span className="leading-relaxed">{errorMsg}</span>
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Organization Input */}
            <div className="space-y-1.5 relative group">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 group-focus-within:text-primary transition-colors">
                Organization Realm
              </label>
              <div className="relative flex items-center">
                <Globe className="absolute left-3 h-4.5 w-4.5 text-slate-500 group-focus-within:text-primary transition-colors" />
                <input
                  type="text"
                  required
                  value={orgName}
                  onChange={e => setOrgName(e.target.value)}
                  placeholder="e.g. Acme Corp SRE"
                  className="w-full h-11 pl-10 pr-4 bg-slate-900/50 border border-slate-800 hover:border-slate-700 rounded-lg text-sm text-white transition-all focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary placeholder:text-slate-600"
                />
              </div>
            </div>

            {/* Email Input */}
            <div className="space-y-1.5 relative group">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 group-focus-within:text-primary transition-colors">
                SRE Operator Email
              </label>
              <div className="relative flex items-center">
                <Mail className="absolute left-3 h-4.5 w-4.5 text-slate-500 group-focus-within:text-primary transition-colors" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="w-full h-11 pl-10 pr-4 bg-slate-900/50 border border-slate-800 hover:border-slate-700 rounded-lg text-sm text-white transition-all focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary placeholder:text-slate-600"
                />
              </div>
            </div>

            {/* Password Input */}
            <div className="space-y-1.5 relative group">
              <div className="flex justify-between items-center">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 group-focus-within:text-primary transition-colors">
                  Operator Password
                </label>
                <span className="text-[10px] text-slate-400 hover:text-slate-200 cursor-pointer transition-colors font-medium">SSO Login?</span>
              </div>
              <div className="relative flex items-center">
                <Lock className="absolute left-3 h-4.5 w-4.5 text-slate-500 group-focus-within:text-primary transition-colors" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full h-11 pl-10 pr-4 bg-slate-900/50 border border-slate-800 hover:border-slate-700 rounded-lg text-sm text-white transition-all focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary placeholder:text-slate-600"
                />
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting || !email || !orgName}
              className="w-full h-11 mt-2 flex items-center justify-center gap-2 bg-primary hover:bg-primary/95 active:scale-[0.98] text-white font-semibold rounded-lg shadow-lg shadow-primary/10 hover:shadow-primary/20 transition-all cursor-pointer text-sm disabled:opacity-50"
            >
              {isSubmitting ? (
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 border-2 border-white/35 border-t-white rounded-full animate-spin" />
                  <span>Validating credentials...</span>
                </div>
              ) : (
                <>
                  <span>Authenticate SRE Console</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>

            {/* Divider */}
            <div className="relative my-4 flex items-center justify-center">
              <span className="absolute inset-x-0 h-px bg-slate-800/60" />
              <span className="relative px-3 bg-[#07070a] text-[10px] font-mono uppercase tracking-wider text-slate-500">
                Or Continue With
              </span>
            </div>

            {/* Google Sign-In Button */}
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isSubmitting}
              className="w-full h-11 flex items-center justify-center gap-2.5 bg-slate-900/40 border border-slate-800 hover:border-slate-700 hover:bg-slate-900/80 active:scale-[0.98] text-white font-semibold rounded-lg shadow-sm hover:shadow-md transition-all cursor-pointer text-sm disabled:opacity-50"
            >
              <svg className="h-4.5 w-4.5 shrink-0" viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335" />
              </svg>
              <span>Sign in with Google</span>
            </button>
          </form>
        </div>

        {/* Bottom footer credit */}
        <div className="flex items-center justify-between text-[10px] text-slate-500 border-t border-slate-800/60 pt-4 max-w-md w-full mx-auto font-mono">
          <span>CONSOLE: v0.9.1-DEV</span>
          <span className="text-green-400 font-semibold uppercase animate-pulse">&bull; ALL REGIONS NORMAL</span>
        </div>
      </div>

      {/* Right Panel: Interactive Node Network Canvas (50%) */}
      <div className="hidden lg:block lg:w-1/2 h-full relative overflow-hidden bg-[#0a0a0f]">
        
        {/* Canvas element */}
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" />

        {/* Text overlay overlay details */}
        <div className="absolute bottom-8 left-8 right-8 bg-[#07070a]/75 border border-border/30 p-4 rounded-lg backdrop-blur-md max-w-sm pointer-events-none animate-in fade-in slide-in-from-bottom-3 duration-500">
          <div className="flex items-center gap-2 font-mono text-[10px] text-primary font-bold mb-1">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-ping" />
            <span>ALERTS SIMULATOR ACTIVE</span>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed font-mono">
            Hover mouse cursor over the canvas node clusters to dynamically warp server traffic links and monitor active packet routing.
          </p>
        </div>
      </div>

    </div>
  );
}
