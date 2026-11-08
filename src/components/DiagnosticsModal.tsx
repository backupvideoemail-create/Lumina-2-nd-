import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Play,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ShieldAlert,
  RefreshCw,
  Cpu,
  ChevronDown,
  ChevronUp,
  History,
  GitCommit,
  Server,
  Layers,
  ArrowRight,
  Info
} from 'lucide-react';

export interface DiagnosticTestDetail {
  id: string;
  name: string;
  category: string;
  status: 'passed' | 'failed' | 'blocked' | 'warning' | 'not_tested';
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  testType?: 'AUTOMATED_UNIT' | 'LIVE_PROBE' | 'INTEGRATION_CHECK' | 'SECURITY_RBAC' | 'STORAGE_AUDIT' | 'MONITORING_EVENT';
  environment: 'production' | 'staging' | 'sandbox';
  timestamp: string;
  commitSha: string;
  cloudRunRevision: string;
  endpointOrProvider: string;
  safeTraceId: string;
  expectedResult: string;
  actualResult: string;
  calculationFormula?: string;
  failureReason?: string;
  rootCauseHypothesis?: string;
  recommendedAction?: string;
  durationMs: number;
  lastSuccessfulRun?: string;
  previousRunStatus?: 'passed' | 'failed' | 'blocked' | 'warning' | 'none';
}

export interface DiagnosticRunSummary {
  runId: string;
  timestamp: string;
  environment: 'production' | 'staging' | 'sandbox';
  commitSha: string;
  cloudRunRevision: string;
  overallStatus: 'HEALTHY' | 'ACTION_REQUIRED' | 'DEGRADED';
  stats: {
    total: number;
    passed: number;
    failed: number;
    blocked: number;
    warning: number;
  };
  results: DiagnosticTestDetail[];
}

interface DiagnosticsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DiagnosticsModal: React.FC<DiagnosticsModalProps> = ({ isOpen, onClose }) => {
  const [running, setRunning] = useState(false);
  const [runSummary, setRunSummary] = useState<DiagnosticRunSummary | null>(null);
  const [expandedTestIds, setExpandedTestIds] = useState<Record<string, boolean>>({});
  const [showHistory, setShowHistory] = useState(false);
  const [historyRuns, setHistoryRuns] = useState<DiagnosticRunSummary[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'all' | 'critical' | 'issues'>('all');

  useEffect(() => {
    if (isOpen && !runSummary && !running) {
      runDiagnostics();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const toggleExpand = (id: string) => {
    setExpandedTestIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const expandAll = () => {
    if (!runSummary) return;
    const allExpanded: Record<string, boolean> = {};
    runSummary.results.forEach((r) => {
      allExpanded[r.id] = true;
    });
    setExpandedTestIds(allExpanded);
  };

  const collapseAll = () => {
    setExpandedTestIds({});
  };

  const runDiagnostics = async () => {
    setRunning(true);
    try {
      const token = localStorage.getItem('lumina_session_token') || '';
      const adminKey = localStorage.getItem('lumina_admin_key') || '';
      const res = await fetch('/api/admin/diagnostics', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(adminKey ? { 'x-admin-key': adminKey } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });
      const data = await res.json().catch(() => null);
      if (data?.runSummary) {
        setRunSummary(data.runSummary);
        // Automatically expand any failed or blocked tests
        const autoExpanded: Record<string, boolean> = {};
        data.runSummary.results.forEach((r: DiagnosticTestDetail) => {
          if (r.status === 'failed' || r.status === 'blocked' || r.severity === 'CRITICAL') {
            autoExpanded[r.id] = true;
          }
        });
        setExpandedTestIds(autoExpanded);
      }
    } catch (err: any) {
      console.error('[Diagnostics Modal] Run error:', err);
    } finally {
      setRunning(false);
    }
  };

  const fetchHistory = async () => {
    setLoadingHistory(true);
    setShowHistory(true);
    try {
      const token = localStorage.getItem('lumina_session_token') || '';
      const adminKey = localStorage.getItem('lumina_admin_key') || '';
      const res = await fetch('/api/admin/diagnostics/history', {
        headers: {
          ...(adminKey ? { 'x-admin-key': adminKey } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });
      const data = await res.json().catch(() => null);
      if (data?.history) {
        setHistoryRuns(data.history);
      }
    } catch (err) {
      console.error('[Diagnostics History Error]:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const results = runSummary?.results || [];
  const stats = runSummary?.stats || {
    total: 0,
    passed: 0,
    failed: 0,
    blocked: 0,
    warning: 0
  };

  const filteredResults = results.filter((r) => {
    if (activeFilter === 'critical') return r.severity === 'CRITICAL';
    if (activeFilter === 'issues') return r.status === 'failed' || r.status === 'blocked' || r.status === 'warning';
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-md overflow-hidden">
      <div className="absolute inset-0" onClick={onClose} />

      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="relative w-full max-w-3xl bg-[#0c0b10] border border-white/15 rounded-3xl shadow-2xl z-10 overflow-hidden flex flex-col max-h-[92vh]"
      >
        {/* Header Bar */}
        <div className="p-4 sm:p-5 border-b border-white/10 flex items-center justify-between bg-black/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#ff9f00]/20 to-[#ea580c]/20 border border-[#ff9f00]/40 flex items-center justify-center text-[#ff9f00] shadow-inner">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-bold text-white font-display">
                  Central Production Diagnostics & Audit
                </h3>
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  Authoritative
                </span>
              </div>
              <p className="text-xs text-stone-400">
                10 Isolated Modules · Real Status & Calculation Audit · Zero Live Financial Mutation
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (showHistory) setShowHistory(false);
                else fetchHistory();
              }}
              className="p-2 rounded-xl text-stone-400 hover:text-white bg-white/5 hover:bg-white/10 transition-colors cursor-pointer text-xs flex items-center gap-1.5"
              title="View Test History"
            >
              <History className="w-4 h-4" />
              <span className="hidden sm:inline">{showHistory ? 'Current Run' : 'History'}</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-full text-stone-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* System Environment Meta Header */}
        <div className="px-4 sm:px-5 py-2.5 bg-white/[0.02] border-b border-white/5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-stone-400 font-mono">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="flex items-center gap-1 text-stone-300">
              <Server className="w-3.5 h-3.5 text-[#ff9f00]" />
              <span>Env: </span>
              <strong className="text-white uppercase">{runSummary?.environment || 'sandbox'}</strong>
            </span>
            <span className="flex items-center gap-1">
              <GitCommit className="w-3.5 h-3.5 text-sky-400" />
              <span>Commit: </span>
              <strong className="text-stone-200">{runSummary?.commitSha ? runSummary.commitSha.slice(0, 8) : 'UNKNOWN'}</strong>
            </span>
            <span className="flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-purple-400" />
              <span>Revision: </span>
              <strong className="text-stone-200">{runSummary?.cloudRunRevision || 'local-dev'}</strong>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                runSummary?.overallStatus === 'HEALTHY'
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : runSummary?.overallStatus === 'ACTION_REQUIRED'
                  ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
              }`}
            >
              {runSummary ? `STATUS: ${runSummary.overallStatus}` : 'AUDIT PENDING'}
            </span>
          </div>
        </div>

        {/* Dynamic Summary Badges & Action Bar */}
        <div className="px-4 sm:px-5 py-3 bg-[#111017] border-b border-white/5 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 flex-wrap font-mono">
            <span className="text-stone-400 text-[11px] font-sans font-semibold">Live Audit Summary:</span>
            <span className="px-2 py-1 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-bold flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              <span>{stats.passed} Passed</span>
            </span>
            {stats.failed > 0 && (
              <span className="px-2 py-1 rounded-lg bg-rose-500/15 text-rose-400 border border-rose-500/30 font-bold flex items-center gap-1">
                <XCircle className="w-3 h-3" />
                <span>{stats.failed} Failed</span>
              </span>
            )}
            {stats.blocked > 0 && (
              <span className="px-2 py-1 rounded-lg bg-amber-500/15 text-amber-300 border border-amber-500/30 font-bold flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                <span>{stats.blocked} Blocked</span>
              </span>
            )}
            {stats.warning > 0 && (
              <span className="px-2 py-1 rounded-lg bg-yellow-500/15 text-yellow-300 border border-yellow-500/30 font-bold flex items-center gap-1">
                <Info className="w-3 h-3" />
                <span>{stats.warning} Warning</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-black/40 rounded-xl p-0.5 border border-white/5">
              <button
                onClick={() => setActiveFilter('all')}
                className={`px-2 py-1 rounded-lg text-[10px] font-semibold transition-colors cursor-pointer ${
                  activeFilter === 'all' ? 'bg-white/10 text-white' : 'text-stone-400 hover:text-white'
                }`}
              >
                All (10)
              </button>
              <button
                onClick={() => setActiveFilter('critical')}
                className={`px-2 py-1 rounded-lg text-[10px] font-semibold transition-colors cursor-pointer ${
                  activeFilter === 'critical' ? 'bg-rose-500/20 text-rose-300' : 'text-stone-400 hover:text-white'
                }`}
              >
                Critical
              </button>
              <button
                onClick={() => setActiveFilter('issues')}
                className={`px-2 py-1 rounded-lg text-[10px] font-semibold transition-colors cursor-pointer ${
                  activeFilter === 'issues' ? 'bg-amber-500/20 text-amber-300' : 'text-stone-400 hover:text-white'
                }`}
              >
                Issues ({stats.failed + stats.blocked + stats.warning})
              </button>
            </div>

            <button
              onClick={runDiagnostics}
              disabled={running}
              className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-[#ff9f00] to-[#ea580c] hover:opacity-95 text-black font-black text-xs flex items-center gap-1.5 shadow-md active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              {running ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Executing 10 Modules...</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-black" />
                  <span>Execute Full Audit</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* View Switch: History or Current Results */}
        {showHistory ? (
          <div className="p-4 sm:p-5 overflow-y-auto space-y-3 flex-1 no-scrollbar">
            <div className="flex items-center justify-between pb-2 border-b border-white/5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-stone-300">
                Permanent Firestore Run History (diagnostics_history)
              </h4>
              <button
                onClick={fetchHistory}
                disabled={loadingHistory}
                className="text-[11px] text-[#ff9f00] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className={`w-3 h-3 ${loadingHistory ? 'animate-spin' : ''}`} />
                <span>Refresh History</span>
              </button>
            </div>

            {historyRuns.length === 0 ? (
              <div className="text-center py-8 text-stone-500 text-xs">
                No past diagnostic runs recorded yet in Firestore.
              </div>
            ) : (
              historyRuns.map((h, idx) => (
                <div
                  key={h.runId || idx}
                  className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/10 space-y-2"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono text-stone-300 font-semibold">{h.runId}</span>
                    <span className="text-[11px] text-stone-500">{new Date(h.timestamp).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-2 font-mono">
                      <span className="text-emerald-400 font-bold">{h.stats?.passed || 0} PASS</span>
                      <span className="text-rose-400 font-bold">{h.stats?.failed || 0} FAIL</span>
                      <span className="text-amber-400 font-bold">{h.stats?.blocked || 0} BLOCKED</span>
                    </div>
                    <button
                      onClick={() => {
                        setRunSummary(h);
                        setShowHistory(false);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-white text-[11px] font-semibold transition-colors cursor-pointer flex items-center gap-1"
                    >
                      <span>Load Snapshot</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          /* Current 10 Module Cards */
          <div className="p-3 sm:p-5 overflow-y-auto space-y-2.5 flex-1 no-scrollbar bg-[#09080d]">
            <div className="flex items-center justify-between pb-1 text-[11px] text-stone-400">
              <span>Showing {filteredResults.length} of 10 Diagnostic Test Modules</span>
              <div className="flex items-center gap-2">
                <button onClick={expandAll} className="hover:text-white text-[10px] cursor-pointer">
                  Expand All
                </button>
                <span>·</span>
                <button onClick={collapseAll} className="hover:text-white text-[10px] cursor-pointer">
                  Collapse All
                </button>
              </div>
            </div>

            {filteredResults.map((r) => {
              const isExpanded = Boolean(expandedTestIds[r.id]);
              const isPassed = r.status === 'passed';
              const isFailed = r.status === 'failed';
              const isBlocked = r.status === 'blocked';
              const isWarning = r.status === 'warning';

              const severityColors = {
                CRITICAL: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
                HIGH: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
                MEDIUM: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30',
                LOW: 'bg-slate-500/15 text-slate-300 border-slate-500/30'
              };

              return (
                <div
                  key={r.id}
                  className={`rounded-2xl border transition-all ${
                    isFailed
                      ? 'bg-rose-950/20 border-rose-500/40 shadow-[0_0_15px_rgba(244,63,94,0.1)]'
                      : isBlocked
                      ? 'bg-amber-950/20 border-amber-500/40 shadow-[0_0_15px_rgba(245,158,11,0.1)]'
                      : isWarning
                      ? 'bg-yellow-950/20 border-yellow-500/30'
                      : 'bg-white/[0.02] border-white/10 hover:border-white/20'
                  }`}
                >
                  {/* Card Header (Always visible) */}
                  <div
                    onClick={() => toggleExpand(r.id)}
                    className="p-3.5 sm:p-4 flex items-start justify-between gap-3 cursor-pointer select-none"
                  >
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                          {r.category}
                        </span>
                        <span
                          className={`text-[9px] font-black uppercase px-1.5 py-0.2 rounded border ${
                            severityColors[r.severity] || severityColors.LOW
                          }`}
                        >
                          {r.severity}
                        </span>
                        {r.testType && (
                          <span className="text-[9px] font-mono text-sky-300 bg-sky-500/15 border border-sky-500/30 px-1.5 py-0.2 rounded uppercase">
                            {r.testType}
                          </span>
                        )}
                        {r.lastSuccessfulRun && (
                          <span className="text-[9px] font-mono text-emerald-400/80 bg-white/5 px-1.5 py-0.2 rounded">
                            Last Pass: {new Date(r.lastSuccessfulRun).toLocaleTimeString()}
                          </span>
                        )}
                        {r.previousRunStatus && r.previousRunStatus !== 'none' && (
                          <span className="text-[9px] font-mono text-stone-400 bg-white/5 px-1.5 py-0.2 rounded">
                            Prev: {r.previousRunStatus.toUpperCase()} → Curr: {r.status.toUpperCase()}
                          </span>
                        )}
                      </div>

                      <h4 className="text-xs sm:text-sm font-bold text-white flex items-center gap-2">
                        <span>{r.name}</span>
                      </h4>

                      <p className="text-[11px] text-stone-400 font-mono">
                        {r.endpointOrProvider} · {r.durationMs}ms
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 pt-0.5">
                      {isPassed && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-emerald-500/20 text-emerald-400 text-[11px] font-bold border border-emerald-500/30">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>PASS</span>
                        </span>
                      )}
                      {isFailed && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-rose-500/20 text-rose-400 text-[11px] font-bold border border-rose-500/30">
                          <XCircle className="w-3.5 h-3.5" />
                          <span>FAIL</span>
                        </span>
                      )}
                      {isBlocked && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-amber-500/20 text-amber-300 text-[11px] font-bold border border-amber-500/30">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          <span>BLOCKED</span>
                        </span>
                      )}
                      {isWarning && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-yellow-500/20 text-yellow-300 text-[11px] font-bold border border-yellow-500/30">
                          <Info className="w-3.5 h-3.5" />
                          <span>WARNING</span>
                        </span>
                      )}

                      <div className="p-1 rounded-lg bg-white/5 text-stone-400 hover:text-white">
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </div>
                    </div>
                  </div>

                  {/* Expandable Technical Detail View */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="px-3.5 sm:px-4 pb-4 pt-1 border-t border-white/5 space-y-2.5 text-xs font-mono"
                      >
                        {/* Safe Trace ID & Timestamp */}
                        <div className="flex items-center justify-between text-[10px] text-stone-400 pt-1">
                          <span>Trace ID: {r.safeTraceId}</span>
                          <span>Tested At: {new Date(r.timestamp).toLocaleTimeString()}</span>
                        </div>

                        {/* Calculation Formula if present (Test 9 Credit Ledger) */}
                        {r.calculationFormula && (
                          <div className="p-2.5 rounded-xl bg-indigo-950/30 border border-indigo-500/30 space-y-1">
                            <span className="text-[10px] font-bold uppercase text-indigo-400 block">
                              Calculation Formula:
                            </span>
                            <div className="text-indigo-200 text-[11px]">{r.calculationFormula}</div>
                          </div>
                        )}

                        {/* Expected Result */}
                        <div className="p-2.5 rounded-xl bg-black/40 border border-white/5 space-y-1">
                          <span className="text-[10px] font-bold uppercase text-stone-400 block">
                            Expected Result:
                          </span>
                          <div className="text-stone-300 text-[11px] break-words">{r.expectedResult}</div>
                        </div>

                        {/* Actual Result */}
                        <div
                          className={`p-2.5 rounded-xl border space-y-1 ${
                            isPassed
                              ? 'bg-emerald-950/20 border-emerald-500/30'
                              : isFailed
                              ? 'bg-rose-950/30 border-rose-500/40'
                              : 'bg-amber-950/20 border-amber-500/30'
                          }`}
                        >
                          <span
                            className={`text-[10px] font-bold uppercase block ${
                              isPassed ? 'text-emerald-400' : isFailed ? 'text-rose-400' : 'text-amber-400'
                            }`}
                          >
                            Actual Result:
                          </span>
                          <div className="text-stone-200 text-[11px] break-words">{r.actualResult}</div>
                        </div>

                        {/* Failure Reason & Root Cause Hypothesis (if not passed) */}
                        {!isPassed && (
                          <div className="space-y-2 pt-1">
                            {r.failureReason && (
                              <div className="p-2.5 rounded-xl bg-rose-950/40 border border-rose-500/50 space-y-1">
                                <span className="text-[10px] font-bold uppercase text-rose-300 flex items-center gap-1">
                                  <ShieldAlert className="w-3 h-3" />
                                  <span>Failure Reason:</span>
                                </span>
                                <div className="text-rose-200 text-[11px]">{r.failureReason}</div>
                              </div>
                            )}

                            {r.rootCauseHypothesis && (
                              <div className="p-2.5 rounded-xl bg-amber-950/30 border border-amber-500/40 space-y-1">
                                <span className="text-[10px] font-bold uppercase text-amber-300 block">
                                  Root Cause / Hypothesis:
                                </span>
                                <div className="text-amber-200 text-[11px]">{r.rootCauseHypothesis}</div>
                              </div>
                            )}

                            {r.recommendedAction && (
                              <div className="p-2.5 rounded-xl bg-sky-950/30 border border-sky-500/40 space-y-1">
                                <span className="text-[10px] font-bold uppercase text-sky-300 block">
                                  Recommended Owner Action:
                                </span>
                                <div className="text-sky-200 text-[11px]">{r.recommendedAction}</div>
                              </div>
                            )}
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        )}
      </motion.div>
    </div>
  );
};
