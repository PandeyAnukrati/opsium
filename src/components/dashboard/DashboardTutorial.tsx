import { useState, useEffect } from 'react';
import { HelpCircle, ChevronRight, Play, CheckCircle } from 'lucide-react';

interface DashboardTutorialProps {
  onClose: () => void;
}

interface TutorialStep {
  targetId?: string;
  title: string;
  description: string;
  position: 'top' | 'bottom' | 'left' | 'right' | 'center';
}

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    title: "Welcome to Opsium SRE Console",
    description: "Opsium is your AI-powered Incident Postmortem Automation Hub. This guide will walk you through the core features of the dashboard to get you up to speed in seconds.",
    position: 'center'
  },
  {
    targetId: 'tutorial-sidebar-hub',
    title: "Incident Intelligence Hub",
    description: "Access the main control center to monitor real-time SRE metrics, view past outages, and browse RAG timeline logs.",
    position: 'right'
  },
  {
    targetId: 'tutorial-dashboard-declare',
    title: "Declare Incidents",
    description: "Trigger a new incident workspace. Upload raw system logs, Slack messages, or Jira tickets to feed the AI context pool.",
    position: 'bottom'
  },
  {
    targetId: 'tutorial-header-clock',
    title: "Synchronized SRE Clock",
    description: "Maintains real-time Local and UTC clocks side-by-side to guarantee timestamp synchronization during timeline logging.",
    position: 'bottom'
  },
  {
    targetId: 'tutorial-sidebar-settings',
    title: "AI & Vector Database Keys",
    description: "Configure your Google Gemini API and Hugging Face Token keys to enable live AI postmortem synthesis and LangChain semantic search.",
    position: 'right'
  },
  {
    targetId: 'tutorial-header-profile',
    title: "Operator Session Control",
    description: "Manage your authenticated operator profile, view session credentials, and log out from the console safely.",
    position: 'left'
  }
];

export default function DashboardTutorial({ onClose }: DashboardTutorialProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  const stepInfo = TUTORIAL_STEPS[currentStep];

  useEffect(() => {
    const updatePosition = () => {
      if (!stepInfo.targetId) {
        setTargetRect(null);
        return;
      }
      const el = document.getElementById(stepInfo.targetId);
      if (el) {
        setTargetRect(el.getBoundingClientRect());
      } else {
        setTargetRect(null);
      }
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    
    // Periodically check element position to handle sidebar transitions
    const timer = setInterval(updatePosition, 200);

    return () => {
      window.removeEventListener('resize', updatePosition);
      clearInterval(timer);
    };
  }, [currentStep, stepInfo.targetId]);

  const handleNext = () => {
    if (currentStep < TUTORIAL_STEPS.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      handleComplete();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleComplete = () => {
    localStorage.setItem('opsium_tutorial_completed', 'true');
    onClose();
  };

  // Build Clip Path for Spotlight cutout
  const getClipPath = () => {
    if (!targetRect) return 'none';
    const padding = 6;
    const top = targetRect.top - padding;
    const left = targetRect.left - padding;
    const bottom = targetRect.bottom + padding;
    const right = targetRect.right + padding;
    
    return `polygon(
      0% 0%, 
      0% 100%, 
      ${left}px 100%, 
      ${left}px ${top}px, 
      ${right}px ${top}px, 
      ${right}px ${bottom}px, 
      ${left}px ${bottom}px, 
      ${left}px 100%, 
      100% 100%, 
      100% 0%
    )`;
  };

  // Calculate Popover Position style
  const getPopoverStyle = () => {
    if (!targetRect) {
      return {
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        position: 'fixed' as const
      };
    }

    const padding = 16;
    const popoverWidth = 320;
    let top: number;
    let left: number;

    const targetCenterY = targetRect.top + targetRect.height / 2;
    const targetCenterX = targetRect.left + targetRect.width / 2;

    switch (stepInfo.position) {
      case 'right':
        top = targetCenterY - 100;
        left = targetRect.right + padding;
        break;
      case 'left':
        top = targetCenterY - 100;
        left = targetRect.left - popoverWidth - padding;
        break;
      case 'bottom':
        top = targetRect.bottom + padding;
        left = targetCenterX - popoverWidth / 2;
        break;
      case 'top':
        top = targetRect.top - 220 - padding;
        left = targetCenterX - popoverWidth / 2;
        break;
      default:
        top = window.innerHeight / 2 - 100;
        left = window.innerWidth / 2 - popoverWidth / 2;
    }

    // Boundary constraints to stay on screen
    left = Math.max(12, Math.min(left, window.innerWidth - popoverWidth - 12));
    top = Math.max(12, Math.min(top, window.innerHeight - 250 - 12));

    return {
      top: `${top}px`,
      left: `${left}px`,
      position: 'fixed' as const,
      width: `${popoverWidth}px`
    };
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden font-sans pointer-events-none">
      
      {/* Background Mask Layer with Spotlight Cutout */}
      <div 
        className="absolute inset-0 bg-[#07070a]/80 backdrop-blur-[2px] transition-all duration-300 pointer-events-auto"
        style={{ clipPath: getClipPath() }}
      />

      {/* Popover Card */}
      <div 
        className="bg-card text-card-foreground border border-border rounded-xl shadow-2xl p-6 flex flex-col gap-4 pointer-events-auto animate-in zoom-in-95 duration-200"
        style={getPopoverStyle()}
      >
        {/* Step counter */}
        <div className="flex items-center justify-between text-[10px] font-mono font-bold tracking-wider text-primary uppercase">
          <span>CONSOLE ONBOARDING</span>
          <span>{currentStep + 1} / {TUTORIAL_STEPS.length}</span>
        </div>

        {/* Title */}
        <h4 className="text-sm font-extrabold text-white tracking-tight flex items-center gap-1.5">
          {currentStep === 0 && <Play className="h-4.5 w-4.5 text-primary shrink-0" />}
          {currentStep > 0 && currentStep < TUTORIAL_STEPS.length - 1 && <HelpCircle className="h-4.5 w-4.5 text-primary shrink-0" />}
          {currentStep === TUTORIAL_STEPS.length - 1 && <CheckCircle className="h-4.5 w-4.5 text-green-400 shrink-0" />}
          {stepInfo.title}
        </h4>

        {/* Description */}
        <p className="text-xs text-muted-foreground leading-relaxed">
          {stepInfo.description}
        </p>

        {/* Navigation Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-border/60">
          <button
            onClick={handleComplete}
            className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:text-white transition-colors cursor-pointer"
          >
            Skip
          </button>
          
          <div className="flex gap-2">
            {currentStep > 0 && (
              <button
                onClick={handlePrev}
                className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider border border-border hover:border-slate-700 rounded transition-all cursor-pointer text-muted-foreground hover:text-white"
              >
                Back
              </button>
            )}
            <button
              onClick={handleNext}
              className="flex items-center gap-1 px-3 py-1 bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-wider rounded hover:bg-primary/95 active:scale-[0.98] transition-all cursor-pointer shadow-md shadow-primary/10"
            >
              <span>{currentStep === TUTORIAL_STEPS.length - 1 ? 'Start' : 'Next'}</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

      </div>

    </div>
  );
}
