import { useState, useRef } from 'react';
import { mockDb } from '../../lib/db/mockDb';
import { parseFileContent } from '../../lib/retrieval/parser';
import { Upload, X, FileText, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

interface CreateIncidentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newIncidentId: string) => void;
}

interface UploadedFile {
  name: string;
  size: number;
  type: string;
  content: string;
  status: 'pending' | 'processing' | 'success' | 'error';
}

export default function CreateIncidentModal({ isOpen, onClose, onSuccess }: CreateIncidentModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'>('HIGH');
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    processSelectedFiles(e.target.files);
  };

  const processSelectedFiles = (fileList: FileList) => {
    const newFiles: UploadedFile[] = Array.from(fileList).map(file => ({
      name: file.name,
      size: file.size,
      type: file.type || file.name.split('.').pop() || 'txt',
      content: '',
      status: 'pending'
    }));

    setFiles(prev => [...prev, ...newFiles]);

    // Read file contents
    Array.from(fileList).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        setFiles(prev => {
          const updated = [...prev];
          const fileIndex = updated.findIndex(f => f.name === file.name && f.status === 'pending');
          if (fileIndex !== -1) {
            updated[fileIndex].content = text;
            updated[fileIndex].status = 'success';
          }
          return updated;
        });
      };
      reader.onerror = () => {
        setFiles(prev => {
          const updated = [...prev];
          const fileIndex = updated.findIndex(f => f.name === file.name && f.status === 'pending');
          if (fileIndex !== -1) {
            updated[fileIndex].status = 'error';
          }
          return updated;
        });
      };
      reader.readAsText(file);
    });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files) {
      processSelectedFiles(e.dataTransfer.files);
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, idx) => idx !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsSubmitting(true);

    try {
      // 1. Create incident in DB
      const newInc = mockDb.createIncident({
        title,
        description,
        severity,
        status: 'ACTIVE'
      });

      // 2. Process and save uploaded documents + chunks
      for (const file of files) {
        if (file.status === 'success' && file.content) {
          // Add document metadata
          mockDb.addDocument({
            incidentId: newInc.id,
            fileName: file.name,
            fileType: file.type,
            content: file.content,
            storagePath: `incidents/${newInc.id}/${file.name}`
          });

          // Parse and save chunks
          const parsedChunks = parseFileContent(file.name, file.content, newInc.id);
          mockDb.addChunks(parsedChunks);
        }
      }

      setIsSubmitting(false);
      onSuccess(newInc.id);
      onClose();
    } catch (err) {
      console.error(err);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-card text-card-foreground border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div>
            <h3 className="text-xl font-semibold tracking-tight">Declare New Incident</h3>
            <p className="text-sm text-muted-foreground">Initiate automated report generation by feeding logs and tickets.</p>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Title */}
          <div className="space-y-2">
            <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
              Incident Title <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Payment Gateway timeouts in checkout v2.4"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <label className="text-sm font-medium leading-none">Description / Scope</label>
            <textarea
              rows={3}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Brief description of the outage behavior, customer symptoms, or alert metrics..."
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          {/* Grid for Severity */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none">Severity Level</label>
              <div className="flex gap-2">
                {(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const).map(sev => {
                  const activeColors = {
                    CRITICAL: 'bg-red-500 text-white border-red-500',
                    HIGH: 'bg-orange-500 text-white border-orange-500',
                    MEDIUM: 'bg-yellow-500 text-black border-yellow-500',
                    LOW: 'bg-blue-500 text-white border-blue-500'
                  };

                  const isSelected = severity === sev;

                  return (
                    <button
                      key={sev}
                      type="button"
                      onClick={() => setSeverity(sev)}
                      className={`flex-1 text-center py-2 text-xs font-semibold rounded-md border transition-all cursor-pointer ${
                        isSelected ? activeColors[sev] : `border-border text-muted-foreground hover:text-foreground bg-transparent`
                      }`}
                    >
                      {sev}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Upload Dropzone */}
          <div className="space-y-2">
            <label className="text-sm font-medium leading-none">Evidence Upload (Logs, Slack Export, CSVs, Jira Tickets)</label>
            <div
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center justify-center border-2 border-dashed border-border hover:border-primary/50 bg-muted/40 hover:bg-muted/80 rounded-lg p-6 cursor-pointer transition-all text-center"
            >
              <input
                type="file"
                multiple
                ref={fileInputRef}
                onChange={handleFileChange}
                className="hidden"
                accept=".txt,.log,.json,.csv"
              />
              <Upload className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm font-medium">Drag and drop files here, or click to browse</p>
              <p className="text-xs text-muted-foreground mt-1">Supports .txt, .log, .json (Slack exports), and .csv files</p>
            </div>
          </div>

          {/* File List */}
          {files.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Uploaded Evidence ({files.length})</h4>
              <div className="border border-border rounded-lg divide-y divide-border bg-muted/20">
                {files.map((file, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 text-sm">
                    <div className="flex items-center gap-3 min-w-0">
                      <FileText className="h-5 w-5 text-primary shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium truncate">{file.name}</p>
                        <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {file.status === 'pending' && <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />}
                      {file.status === 'processing' && <Loader2 className="h-4 w-4 text-primary animate-spin" />}
                      {file.status === 'success' && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                      {file.status === 'error' && <AlertCircle className="h-4 w-4 text-red-500" />}
                      <button
                        type="button"
                        onClick={() => removeFile(idx)}
                        className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-border bg-muted/10">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || !title.trim()}
            className="flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-primary hover:bg-primary/95 active:scale-[0.98] transition-all rounded-lg disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Declaring...
              </>
            ) : (
              'Declare & Start Analysis'
            )}
          </button>
        </div>

      </div>
    </div>
  );
}
