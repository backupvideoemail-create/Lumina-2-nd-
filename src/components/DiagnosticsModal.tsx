import React, { useState } from 'react';
import { motion } from 'motion/react';
import { X, Play, CheckCircle2, XCircle, AlertCircle, RefreshCw, Cpu, Key } from 'lucide-react';

interface DiagnosticResult {
  id: string;
  name: string;
  category: 'Core Architecture' | 'Live Provider Integration' | 'Security & Payments';
  status: 'pending' | 'running' | 'passed' | 'failed' | 'pending_config';
  details?: string;
  durationMs?: number;
  requiredConfig?: string;
}

interface DiagnosticsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DiagnosticsModal: React.FC<DiagnosticsModalProps> = ({ isOpen, onClose }) => {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<DiagnosticResult[]>([
    { id: 'auth_isolation', name: 'Authentication & Multi-Tenant User Isolation', category: 'Core Architecture', status: 'pending' },
    { id: 'pricing_markup', name: 'Central Pricing Engine (USD/INR + 40% Markup Rule)', category: 'Core Architecture', status: 'pending' },
    { id: 'payment_idempotency', name: 'Server Payment Verification & Idempotency Guard', category: 'Security & Payments', status: 'pending' },
    { id: 'credit_atomic_refund', name: 'Atomic Credit Reserve, Finalize & 100% Refund', category: 'Core Architecture', status: 'pending' },
    { id: 'template_manager_db', name: 'Self-Service Runtime Dynamic Template Manager', category: 'Core Architecture', status: 'pending' },
    { id: 'media_storage_engine', name: 'Durable Media Storage & Protected Asset Access', category: 'Core Architecture', status: 'pending' },
    { id: 'razorpay_live_gateway', name: 'Razorpay Live Gateway & UPI AutoPay Mandates', category: 'Live Provider Integration', status: 'pending' },
    { id: 'gemini_image_pipeline', name: 'Google Gemini Photo Pipeline (gemini-3.1-flash-image)', category: 'Live Provider Integration', status: 'pending' },
    { id: 'veo_video_pipeline', name: 'Google Veo Video Pipeline (veo-3.1-lite-generate-preview)', category: 'Live Provider Integration', status: 'pending' },
    { id: 'higgsfield_faceswap', name: 'Higgsfield Neural Face Swap Adapter Pipeline', category: 'Live Provider Integration', status: 'pending' }
  ]);

  if (!isOpen) return null;

  const runDiagnostics = async () => {
    setRunning(true);
    try {
      const token = localStorage.getItem('lumina_session_token') || '';
      const res = await fetch('/api/admin/diagnostics', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': localStorage.getItem('lumina_admin_key') || '',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        }
      });
      const data = await res.json();
      if (data.results) {
        setResults(data.results);
      }
    } catch (err: any) {
      console.error('[Diagnostics Error]:', err);
    } finally {
      setRunning(false);
    }
  };

  const passedCount = results.filter((r) => r.status === 'passed').length;
  const pendingConfigCount = results.filter((r) => r.status === 'pending_config').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md overflow-hidden">
      <div className="absolute inset-0" onClick={onClose} />

      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="relative w-full max-w-xl bg-[#0f0e14] border border-white/15 rounded-3xl shadow-2xl z-10 overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="p-5 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white font-display">
                Production Readiness & Integration Audit
              </h3>
              <p className="text-xs text-stone-400">
                Live verification of Payments, Ledger, DB, AI pipelines & Provider Credentials
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-stone-400 hover:text-white hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status Bar */}
        <div className="px-5 py-3 bg-white/[0.02] border-b border-white/5 flex items-center justify-between text-xs">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-emerald-400 font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{passedCount} Passed</span>
            </span>
            {pendingConfigCount > 0 && (
              <span className="flex items-center gap-1.5 text-amber-400 font-semibold">
                <Key className="w-3.5 h-3.5" />
                <span>{pendingConfigCount} Awaiting External Key</span>
              </span>
            )}
          </div>
          <button
            onClick={runDiagnostics}
            disabled={running}
            className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-[#ff9f00] to-[#ea580c] text-black font-black text-xs flex items-center gap-1.5 shadow-md active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            {running ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Running Audit...</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-black" />
                <span>Run Live Test Suite</span>
              </>
            )}
          </button>
        </div>

        {/* Results List */}
        <div className="p-5 overflow-y-auto space-y-2.5 flex-1 no-scrollbar">
          {results.map((r) => {
            const isPassed = r.status === 'passed';
            const isPendingConfig = r.status === 'pending_config';
            const isFailed = r.status === 'failed';

            return (
              <div
                key={r.id}
                className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 space-y-1.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                      {r.category}
                    </span>
                    <h4 className="text-xs sm:text-sm font-semibold text-white">
                      {r.name}
                    </h4>
                  </div>

                  <div className="shrink-0 pt-0.5">
                    {isPassed && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 text-[10px] font-bold">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>PASS ({r.durationMs}ms)</span>
                      </span>
                    )}
                    {isPendingConfig && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 text-[10px] font-bold">
                        <Key className="w-3 h-3" />
                        <span>CONFIG REQUIRED</span>
                      </span>
                    )}
                    {isFailed && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-400 text-[10px] font-bold">
                        <XCircle className="w-3 h-3" />
                        <span>FAIL</span>
                      </span>
                    )}
                    {r.status === 'pending' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-stone-800 text-stone-400 text-[10px] font-medium">
                        READY
                      </span>
                    )}
                  </div>
                </div>

                {r.details && (
                  <p className="text-[11px] text-stone-300 font-mono bg-black/40 p-2 rounded-xl border border-white/5 break-words">
                    {r.details}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
};
