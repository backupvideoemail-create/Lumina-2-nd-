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
  Info,
  HardDrive,
  Trash2,
  Bell,
  AlertCircle,
  ShieldCheck,
  Copy,
  Check,
  ExternalLink
} from 'lucide-react';
import { getQueueStats, hdDownloadQueue, QueueStats } from '../services/media/hdDownloadQueue';
import { mediaCacheStorage, MediaCacheTelemetry } from '../services/media/mediaCacheStorage';
import { normalizeAlertTo12Fields } from '../services/monitoring/cloudMonitoring';
import { AUTH_POLICY } from '../config/authConfig';
import { FxRateStatus, OwnerOmniTestRecord, PerTemplateReadinessItem } from '../types';
import { getStoredSessionToken } from '../utils/authSession';

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
  const [activeTab, setActiveTab] = useState<'audit' | 'readiness' | 'omni_test' | 'history' | 'alerts'>('audit');
  const [historyRuns, setHistoryRuns] = useState<DiagnosticRunSummary[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historySource, setHistorySource] = useState<'firestore_persistent' | 'in_memory_ring_buffer'>('in_memory_ring_buffer');
  const [historyWarning, setHistoryWarning] = useState<string>('');
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loadingAlerts, setLoadingAlerts] = useState(false);
  const [alertsSource, setAlertsSource] = useState<string>('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'critical' | 'issues'>('all');
  const [cacheStats, setCacheStats] = useState<MediaCacheTelemetry | null>(null);
  const [queueStats, setQueueStats] = useState<QueueStats | null>(null);
  const [persistenceStatus, setPersistenceStatus] = useState<'PERSISTED' | 'PERSISTENCE_FAILED' | 'UNAVAILABLE_LOCAL_ONLY' | null>(null);
  const [persistenceError, setPersistenceError] = useState<string | null>(null);
  const [isHistoricalSnapshot, setIsHistoricalSnapshot] = useState(false);

  // Per-Template 11-Column Readiness Matrix & Live FX State
  const [readinessItems, setReadinessItems] = useState<PerTemplateReadinessItem[]>([]);
  const [readinessSummary, setReadinessSummary] = useState<any>(null);
  const [fxStatus, setFxStatus] = useState<FxRateStatus | null>(null);
  const [refreshingFx, setRefreshingFx] = useState(false);
  const [loadingReadiness, setLoadingReadiness] = useState(false);
  const [readinessDbGuard, setReadinessDbGuard] = useState<any>(null);
  const [readinessFilter, setReadinessFilter] = useState<'all' | 'ready' | 'blocked'>('all');

  // Owner-Only Gemini Omni 1.2 Manual Paid Test State
  const [omniTests, setOmniTests] = useState<OwnerOmniTestRecord[]>([]);
  const [omniPrompt, setOmniPrompt] = useState('Cinematic golden hour portrait slowly turning toward camera, ultra-realistic 4k lighting');
  const [omniDuration, setOmniDuration] = useState<number>(5);
  const [omniResolution, setOmniResolution] = useState<'720p' | '1080p'>('720p');
  const [omniQuote, setOmniQuote] = useState<any>(null);
  const [omniQuoting, setOmniQuoting] = useState(false);
  const [omniConfirmPaid, setOmniConfirmPaid] = useState(false);
  const [omniRunning, setOmniRunning] = useState(false);
  const [omniTestResult, setOmniTestResult] = useState<OwnerOmniTestRecord | null>(null);
  const [omniTestError, setOmniTestError] = useState<string | null>(null);
  const [diagCopyState, setDiagCopyState] = useState<'idle' | 'md' | 'json' | 'failed'>('idle');

  const loadCacheTelemetry = async () => {
    try {
      setQueueStats(getQueueStats());
      const stats = await mediaCacheStorage.getStats();
      setCacheStats(stats);
    } catch {}
  };

  const fetchReadinessMatrix = async () => {
    setLoadingReadiness(true);
    try {
      const token = getStoredSessionToken() || '';
      const res = await fetch('/api/admin/readiness/matrix', {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data) {
        if (Array.isArray(data.items)) setReadinessItems(data.items);
        if (data.summary) setReadinessSummary(data.summary);
        if (data.fxStatus) setFxStatus(data.fxStatus);
        if (data.databaseGuard) setReadinessDbGuard(data.databaseGuard);
        if (Array.isArray(data.ownerOmniTests)) setOmniTests(data.ownerOmniTests);
      }
    } catch (err) {
      console.error('[Diagnostics Readiness Matrix Error]:', err);
    } finally {
      setLoadingReadiness(false);
    }
  };

  const handleRefreshLiveFx = async () => {
    setRefreshingFx(true);
    try {
      const token = getStoredSessionToken() || '';
      const res = await fetch('/api/admin/pricing/fx/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });
      const data = await res.json().catch(() => null);
      if (data?.fxStatus) setFxStatus(data.fxStatus);
      await fetchReadinessMatrix();
    } catch {
      // ignore
    } finally {
      setRefreshingFx(false);
    }
  };

  const handleQuoteOmniTest = async () => {
    setOmniQuoting(true);
    setOmniTestError(null);
    try {
      const token = getStoredSessionToken() || '';
      const res = await fetch('/api/admin/omni-test/quote', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ durationSeconds: omniDuration, resolution: omniResolution })
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data) {
        setOmniQuote(data);
      } else {
        setOmniTestError(data?.error || 'Failed to compute Omni 1.2 cost preview');
      }
    } catch (err: any) {
      setOmniTestError(err?.message || 'Network error quoting Omni test');
    } finally {
      setOmniQuoting(false);
    }
  };

  const handleRunOmniPaidTest = async () => {
    if (!omniConfirmPaid) return;
    setOmniRunning(true);
    setOmniTestError(null);
    setOmniTestResult(null);
    try {
      const token = getStoredSessionToken() || '';
      const res = await fetch('/api/admin/omni-test/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          prompt: omniPrompt,
          durationSeconds: omniDuration,
          resolution: omniResolution,
          confirmPaidTest: true
        })
      });
      const data = await res.json().catch(() => null);
      if (data?.record) {
        setOmniTestResult(data.record);
        setOmniTests((prev) => [data.record, ...prev]);
      }
      if (!res.ok) {
        setOmniTestError(data?.error || 'Owner Omni 1.2 test failed');
      }
      fetchAlerts();
      fetchReadinessMatrix();
    } catch (err: any) {
      setOmniTestError(err?.message || 'Network error running Omni 1.2 test');
    } finally {
      setOmniRunning(false);
    }
  };

  const handleClearCache = async () => {
    try {
      await hdDownloadQueue.clearCache(true);
      await loadCacheTelemetry();
    } catch {}
  };

  useEffect(() => {
    if (isOpen) {
      loadCacheTelemetry();
      if (!runSummary && !running) {
        runDiagnostics();
      }
      fetchAlerts();
      fetchReadinessMatrix();
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
      const token = getStoredSessionToken() || '';
      const res = await fetch('/api/admin/diagnostics', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });
      const data = await res.json().catch(() => null);
      if (data?.runSummary) {
        setRunSummary(data.runSummary);
        setIsHistoricalSnapshot(false);
        setPersistenceStatus(data.persistenceStatus || null);
        setPersistenceError(data.persistenceError || null);
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
      loadCacheTelemetry();
    }
  };

  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      const token = getStoredSessionToken() || '';
      const res = await fetch('/api/admin/diagnostics/history', {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });
      const data = await res.json().catch(() => null);
      if (data?.history) {
        setHistoryRuns(data.history);
        setHistorySource(data.source || 'in_memory_ring_buffer');
        setHistoryWarning(data.warning || '');
      }
    } catch (err) {
      console.error('[Diagnostics History Error]:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const fetchAlerts = async () => {
    setLoadingAlerts(true);
    try {
      const token = getStoredSessionToken() || '';
      const res = await fetch('/api/admin/monitoring/alerts', {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });
      const data = await res.json().catch(() => null);
      if (data && Array.isArray(data.alerts)) {
        setAlerts(data.alerts);
        setAlertsSource(data.source || '');
      } else {
        setAlerts([]);
      }
    } catch (e) {
      console.error('[Alerts Fetch Error]:', e);
      setAlerts([]);
    } finally {
      setLoadingAlerts(false);
    }
  };

  const handleResolveAlert = async (alertId: string) => {
    try {
      const token = getStoredSessionToken() || '';
      await fetch('/api/admin/monitoring/resolve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ alertId })
      });
      fetchAlerts();
    } catch (e) {
      console.error('[Resolve Alert Error]:', e);
    }
  };

  const results = runSummary?.results || [];
  const executedModulesCount = new Set((results || []).map((r) => r.category)).size || 14;
  const totalTestsCount = results.length || 14;
  const stats = runSummary?.stats || {
    total: 0,
    passed: 0,
    failed: 0,
    blocked: 0,
    warning: 0
  };
  const alertsList = (Array.isArray(alerts) ? alerts : []).map((a) => normalizeAlertTo12Fields(a));
  const unresolvedAlertsCount = alertsList.filter((a) => !a.resolved).length;

  const copyTextSafe = async (text: string): Promise<boolean> => {
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {}
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  };

  const handleCopyDiagnosticsReport = async (format: 'markdown' | 'json') => {
    const unresolved = alertsList.filter((a) => !a.resolved);
    const payload = {
      reportSchemaVersion: '3.1-diagnostics-sanitized',
      generatedAt: new Date().toISOString(),
      canonicalFirebase: {
        projectId: 'ai-prime-studio',
        projectNumber: '855598524398',
        databaseId: '(default)',
        guard: readinessDbGuard || null
      },
      authPolicy: AUTH_POLICY,
      runSummary: runSummary || null,
      fxStatus: fxStatus || null,
      readinessSummary: readinessSummary || null,
      readinessItems,
      unresolvedMonitoringAlerts: {
        count: unresolved.length,
        items: unresolved
      },
      ownerOmniTests: omniTests
    };

    const content =
      format === 'json'
        ? JSON.stringify(payload, null, 2)
        : `# AI PRIME STUDIO — DIAGNOSTIC CENTER REPORT
Generated At: ${payload.generatedAt}
Canonical Project / DB: ai-prime-studio / (default) (#855598524398)
Auth Policy: ${AUTH_POLICY.googleOnly ? 'Google-Only (PHONE_AUTH_ENABLED=false)' : 'Multi'}

## 1. DIAGNOSTIC AUDIT PROBES (${runSummary?.stats?.total ?? 0})
${
  runSummary
    ? `- Run ID: ${runSummary.runId} | Overall: ${runSummary.overallStatus} | Env: ${runSummary.environment} | Passed=${runSummary.stats.passed}, Failed=${runSummary.stats.failed}, Blocked=${runSummary.stats.blocked}, Warning=${runSummary.stats.warning}
${runSummary.results.map((r) => `  - [${r.status.toUpperCase()}] ${r.name} (${r.endpointOrProvider})${r.failureReason ? ` — Reason: ${r.failureReason}` : ''}`).join('\n')}`
    : '- No audit run loaded yet.'
}

## 2. LIVE FX & TEMPLATE READINESS (${readinessItems.length})
- FX Status: ${fxStatus ? `${fxStatus.status} (Rate=${fxStatus.rate ?? 'UNAVAILABLE'})` : 'UNAVAILABLE'}
${readinessItems.map((it) => `- [${it.finalStatus}] ${it.title} (${it.id}) | Provider=${it.provider} | Adapter=${it.adapter} | Model=${it.model} | Quote=${it.quoteStatus} (${it.creditsQuoted}✦)${it.rootCause ? ` | RootCause=${it.rootCause}` : ''}`).join('\n') || '- None loaded'}

## 3. UNRESOLVED MONITORING ALERTS — 12-FIELD FORMAT (${unresolved.length})
${
  unresolved.length > 0
    ? unresolved
        .map(
          (a, i) => `${i + 1}. **What failed:** [${a.severity}] ${a.title || a.vector} — ${a.message}
   - Project / Database / Service: ${a.projectDatabaseService}
   - Affected Template: ${a.templateTitle ? `${a.templateTitle} (${a.templateId || 'N/A'})` : (a.templateId || 'N/A (Platform)')}
   - Provider / Adapter / Model: ${a.provider} / ${a.adapter} / ${a.model}
   - API Key / Access Status: ${a.apiKeyAccessStatus}
   - Billing / Quota / Entitlement: ${a.billingQuotaEntitlementStatus}
   - HTTP / Error Code & Stage: HTTP=${a.httpStatus} | Code=${a.errorCode} | Stage=${a.errorStage}
   - Root Cause: ${a.rootCause}
   - Recommended Fix: ${a.recommendedAction}
   - Next Owner Action: ${a.ownerAction}
   - Official Setup / Billing URL: ${a.officialSetupUrl}
   - Timestamp & Correlation ID: ${a.timestamp} | CorrID=${a.correlationId || a.safeTraceId || a.id}`
        )
        .join('\n')
    : '- No unresolved alerts.'
}

Note: Sanitized diagnostic report — no API keys, private keys, tokens, or PII included.`.trim();

    const ok = await copyTextSafe(content);
    setDiagCopyState(ok ? (format === 'json' ? 'json' : 'md') : 'failed');
    setTimeout(() => setDiagCopyState('idle'), 2500);
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
                {executedModulesCount} Isolated Modules ({totalTestsCount} Test Probes) · Real Status & Calculation Audit · Zero Live Financial Mutation
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => handleCopyDiagnosticsReport('markdown')}
              className="px-2.5 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/35 text-amber-200 text-[11px] font-semibold flex items-center gap-1 cursor-pointer transition-colors"
              title="Copy sanitized Diagnostics Report as Markdown"
            >
              {diagCopyState === 'md' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{diagCopyState === 'md' ? 'MD Copied!' : 'Copy MD'}</span>
            </button>
            <button
              type="button"
              onClick={() => handleCopyDiagnosticsReport('json')}
              className="px-2.5 py-1.5 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/35 text-sky-200 text-[11px] font-semibold flex items-center gap-1 cursor-pointer transition-colors"
              title="Copy sanitized Diagnostics Report as JSON"
            >
              {diagCopyState === 'json' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{diagCopyState === 'json' ? 'JSON Copied!' : 'Copy JSON'}</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-full text-stone-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation & Environment Bar */}
        <div className="px-4 sm:px-5 py-2.5 bg-white/[0.02] border-b border-white/5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-stone-400 font-mono">
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setActiveTab('audit')}
              className={`px-3 py-1.5 rounded-xl font-sans text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeTab === 'audit'
                  ? 'bg-[#ff9f00]/20 text-[#ff9f00] border border-[#ff9f00]/30 shadow-sm'
                  : 'bg-white/5 text-stone-400 hover:text-white hover:bg-white/10'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Audit Probes</span>
            </button>
            <button
              onClick={() => {
                setActiveTab('readiness');
                fetchReadinessMatrix();
              }}
              className={`px-3 py-1.5 rounded-xl font-sans text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeTab === 'readiness'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shadow-sm'
                  : 'bg-white/5 text-stone-400 hover:text-white hover:bg-white/10'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Readiness Matrix</span>
              {readinessItems.length > 0 && (
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/10 text-stone-200 tabular-nums">
                  {readinessItems.length}
                </span>
              )}
            </button>
            <button
              onClick={() => {
                setActiveTab('omni_test');
                if (!omniQuote) handleQuoteOmniTest();
              }}
              className={`px-3 py-1.5 rounded-xl font-sans text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeTab === 'omni_test'
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30 shadow-sm'
                  : 'bg-white/5 text-stone-400 hover:text-white hover:bg-white/10'
              }`}
            >
              <Play className="w-3.5 h-3.5" />
              <span>Omni 1.2 Test</span>
            </button>
            <button
              onClick={() => {
                setActiveTab('history');
                fetchHistory();
              }}
              className={`px-3 py-1.5 rounded-xl font-sans text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeTab === 'history'
                  ? 'bg-[#ff9f00]/20 text-[#ff9f00] border border-[#ff9f00]/30 shadow-sm'
                  : 'bg-white/5 text-stone-400 hover:text-white hover:bg-white/10'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Run History</span>
              {historyRuns.length > 0 && (
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/10 text-stone-300">
                  {historyRuns.length}
                </span>
              )}
            </button>
            <button
              onClick={() => {
                setActiveTab('alerts');
                fetchAlerts();
              }}
              className={`px-3 py-1.5 rounded-xl font-sans text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeTab === 'alerts'
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30 shadow-sm'
                  : 'bg-white/5 text-stone-400 hover:text-white hover:bg-white/10'
              }`}
            >
              <Bell className="w-3.5 h-3.5" />
              <span>Alert Center</span>
              {unresolvedAlertsCount > 0 && (
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-rose-500 text-white font-bold tabular-nums">
                  {unresolvedAlertsCount}
                </span>
              )}
            </button>
          </div>

          <div className="flex items-center gap-3 flex-wrap text-[10px]">
            <span className="flex items-center gap-1 text-stone-300">
              <Server className="w-3.5 h-3.5 text-[#ff9f00]" />
              <strong className="text-white uppercase">{runSummary?.environment || 'sandbox'}</strong>
            </span>
            <span className="flex items-center gap-1">
              <GitCommit className="w-3.5 h-3.5 text-sky-400" />
              <strong className="text-stone-200">
                {runSummary?.commitSha === 'UNVERIFIED/BLOCKED'
                  ? 'UNVERIFIED (NO .GIT)'
                  : runSummary?.commitSha
                  ? runSummary.commitSha.slice(0, 8)
                  : 'UNKNOWN'}
              </strong>
            </span>
            <span className="flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-purple-400" />
              <strong className="text-stone-200">{runSummary?.cloudRunRevision || 'local-dev'}</strong>
            </span>
          </div>
        </div>

        {/* View Switch: Alert Center */}
        {activeTab === 'alerts' && (
          <div className="p-4 sm:p-5 overflow-y-auto space-y-3 flex-1 no-scrollbar bg-[#09080d]">
            <div className="flex items-center justify-between pb-2 border-b border-white/5">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-stone-200">
                  Production Incidents & Cloud Monitoring Alerts
                </h4>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-stone-400 border border-white/10 font-mono">
                  Source: {alertsSource || 'Active Memory / Firestore'}
                </span>
              </div>
              <button
                onClick={fetchAlerts}
                disabled={loadingAlerts}
                className="text-[11px] text-[#ff9f00] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className={`w-3 h-3 ${loadingAlerts ? 'animate-spin' : ''}`} />
                <span>Refresh Alerts</span>
              </button>
            </div>

            {alertsList.length === 0 ? (
              <div className="text-center py-12 text-stone-500 text-xs flex flex-col items-center gap-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-400/60" />
                <span>No active production incidents or alerts detected.</span>
              </div>
            ) : (
              alertsList.map((alert, idx) => (
                <div
                  key={alert.id || idx}
                  className={`p-3.5 rounded-2xl border space-y-2 ${
                    alert.resolved
                      ? 'bg-white/[0.01] border-white/5 opacity-60'
                      : alert.severity === 'CRITICAL'
                      ? 'bg-rose-950/20 border-rose-500/40'
                      : 'bg-amber-950/20 border-amber-500/30'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`text-[9px] font-black uppercase px-2 py-0.5 rounded border ${
                          alert.severity === 'CRITICAL'
                            ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                            : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                        }`}
                      >
                        {alert.severity || 'HIGH'}
                      </span>
                      {alert.source && (
                        <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30">
                          {alert.source}
                        </span>
                      )}
                      <span className="font-bold text-white text-xs">{alert.title || alert.vector || 'System Alert'}</span>
                      {alert.endpoint && (
                        <span className="text-[10px] font-mono text-stone-400 bg-black/40 px-1.5 py-0.5 rounded">
                          {alert.endpoint}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-stone-500 font-mono">
                      {new Date(alert.timestamp).toLocaleString()}
                    </span>
                  </div>

                  <p className="text-xs text-stone-300 font-mono break-words bg-black/30 p-2 rounded-xl border border-white/5">
                    {alert.message || JSON.stringify(alert)}
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[10.5px] font-mono text-stone-300 bg-black/25 p-2.5 rounded-xl border border-white/5">
                    <div><span className="text-stone-500">Project/DB/Service:</span> <strong className="text-white">{alert.projectDatabaseService}</strong></div>
                    <div><span className="text-stone-500">Affected Template:</span> <strong className="text-stone-100">{alert.templateTitle ? `${alert.templateTitle} (${alert.templateId || 'N/A'})` : (alert.templateId || 'N/A (Platform)')}</strong></div>
                    <div><span className="text-stone-500">Provider / Adapter / Model:</span> <strong className="text-sky-300">{alert.provider}</strong> / <strong className="text-purple-300">{alert.adapter}</strong> / <strong className="text-amber-300">{alert.model}</strong></div>
                    <div><span className="text-stone-500">HTTP / Code / Stage:</span> <strong className="text-rose-300">HTTP {alert.httpStatus} · {alert.errorCode}</strong> ({alert.errorStage})</div>
                    <div><span className="text-stone-500">API Key / Access:</span> <strong className="text-emerald-300">{alert.apiKeyAccessStatus}</strong></div>
                    <div><span className="text-stone-500">Billing / Quota / Entitlement:</span> <strong className="text-amber-200">{alert.billingQuotaEntitlementStatus}</strong></div>
                    <div><span className="text-stone-500">Timestamp:</span> <strong className="text-stone-200">{alert.timestamp}</strong></div>
                    <div><span className="text-stone-500">Correlation ID:</span> <strong className="text-stone-200">{alert.correlationId || alert.safeTraceId || alert.id}</strong></div>
                    {alert.generationId && (
                      <div className="sm:col-span-2"><span className="text-stone-500">Generation ID:</span> <strong className="text-stone-200">{alert.generationId}</strong></div>
                    )}
                  </div>

                  <div className="p-2.5 rounded-xl bg-black/40 border border-white/5 text-[11px] space-y-1">
                    <div className="text-amber-200">
                      <strong className="text-amber-400">Root Cause:</strong> {alert.rootCause}
                    </div>
                    <div className="text-sky-200">
                      <strong className="text-sky-400">Recommended Fix:</strong> {alert.recommendedAction}
                    </div>
                    <div className="text-emerald-200">
                      <strong className="text-emerald-400">Next Owner Action:</strong> {alert.ownerAction}
                    </div>
                    {alert.officialSetupUrl && (
                      <div className="text-purple-200 flex items-center gap-1 flex-wrap">
                        <strong className="text-purple-400">Official Setup / Billing URL:</strong>
                        <a
                          href={alert.officialSetupUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline hover:text-white inline-flex items-center gap-1 font-mono text-[10px]"
                        >
                          <span>{alert.officialSetupUrl}</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-[11px] pt-1">
                    <span className="font-mono text-stone-400 text-[10px]">
                      Trace: {alert.safeTraceId || alert.id || 'N/A'} · Occurrences: {alert.occurrenceCount || 1}
                    </span>
                    {!alert.resolved ? (
                      <button
                        onClick={() => handleResolveAlert(alert.id)}
                        className="px-2.5 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 text-[10px] font-semibold border border-emerald-500/30 transition-colors cursor-pointer flex items-center gap-1"
                      >
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Mark as Resolved</span>
                      </button>
                    ) : (
                      <span className="text-emerald-400 text-[10px] font-semibold flex items-center gap-1 flex-wrap">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Resolved{alert.resolutionNote ? ` · ${alert.resolutionNote}` : ''}</span>
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* View Switch: 11-Column Per-Template Readiness Matrix + Live FX */}
        {activeTab === 'readiness' && (
          <div className="p-4 sm:p-5 overflow-y-auto space-y-3 flex-1 no-scrollbar bg-[#09080d]">
            {/* Live USD/INR FX Card */}
            <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-white uppercase tracking-wider">Live USD/INR FX Engine</span>
                  <span
                    className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
                      fxStatus?.isFresh
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                        : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                    }`}
                  >
                    {fxStatus?.status || 'UNFETCHED'}
                  </span>
                </div>
                <p className="text-[11px] font-mono text-stone-300 tabular-nums">
                  Rate: <strong>{fxStatus?.rate ? `₹${fxStatus.rate}` : 'UNAVAILABLE'}</strong> · Source: {fxStatus?.source || 'UNINITIALIZED'} · Expires: {fxStatus?.expiresAt ? new Date(fxStatus.expiresAt).toLocaleString() : 'N/A'}
                </p>
              </div>
              <button
                type="button"
                onClick={handleRefreshLiveFx}
                disabled={refreshingFx}
                className="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshingFx ? 'animate-spin' : ''}`} />
                <span>Refresh Live FX</span>
              </button>
            </div>

            {/* Readiness Summary & Filter */}
            <div className="flex flex-wrap items-center justify-between gap-2 pb-1">
              <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono tabular-nums">
                <span className="px-2 py-1 rounded-lg bg-white/5 text-stone-200 border border-white/10">
                  Total Active: {readinessSummary?.totalActive ?? readinessItems.length}
                </span>
                <span className="px-2 py-1 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                  Ready Config: {readinessSummary?.readyConfigCount ?? 0}
                </span>
                <span className="px-2 py-1 rounded-lg bg-purple-500/15 text-purple-300 border border-purple-500/30">
                  Eval Guarded: {readinessSummary?.guardedEvalCount ?? 0}
                </span>
                <span className="px-2 py-1 rounded-lg bg-rose-500/15 text-rose-300 border border-rose-500/30">
                  Missing Secret: {readinessSummary?.blockedSecretCount ?? 0}
                </span>
                <span className="px-2 py-1 rounded-lg bg-amber-500/15 text-amber-300 border border-amber-500/30">
                  Config Blocked: {readinessSummary?.blockedConfigCount ?? 0}
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                {(['all', 'ready', 'blocked'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setReadinessFilter(f)}
                    className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase cursor-pointer ${
                      readinessFilter === f ? 'bg-white/15 text-white' : 'text-stone-400 hover:text-white'
                    }`}
                  >
                    {f}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={fetchReadinessMatrix}
                  disabled={loadingReadiness}
                  className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-amber-300 text-[10px] font-bold flex items-center gap-1 cursor-pointer border border-white/10"
                >
                  <RefreshCw className={`w-3 h-3 ${loadingReadiness ? 'animate-spin' : ''}`} />
                  <span>Reload</span>
                </button>
              </div>
            </div>

            {readinessDbGuard?.blocked && (
              <div className="p-2.5 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-200 text-xs">
                <strong>Database Guard CRITICAL_BLOCKED:</strong> {readinessDbGuard.reason}
              </div>
            )}

            {/* 11-Column Readiness Matrix Table */}
            <div className="overflow-x-auto rounded-2xl border border-white/10 bg-black/40">
              <table className="w-full text-left border-collapse text-[10.5px]">
                <thead className="bg-white/[0.04] text-stone-300 font-bold uppercase tracking-wider border-b border-white/10">
                  <tr>
                    <th className="p-2">Template / Scene</th>
                    <th className="p-2">Provider</th>
                    <th className="p-2">Adapter</th>
                    <th className="p-2">Model</th>
                    <th className="p-2">Workflow</th>
                    <th className="p-2">API Auth</th>
                    <th className="p-2">Billing</th>
                    <th className="p-2">Quota/Bal</th>
                    <th className="p-2">Res/Dur</th>
                    <th className="p-2">Quote</th>
                    <th className="p-2">Live Test / Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 font-mono">
                  {readinessItems
                    .filter((item) => {
                      if (readinessFilter === 'ready') return item.finalStatus === 'READY_CONFIG';
                      if (readinessFilter === 'blocked') return item.finalStatus !== 'READY_CONFIG';
                      return true;
                    })
                    .map((item) => (
                      <React.Fragment key={`${item.itemKind}_${item.id}`}>
                        <tr className="hover:bg-white/[0.02]">
                          <td className="p-2 font-sans">
                            <div className="font-bold text-white">{item.title}</div>
                            <div className="text-[9.5px] font-mono text-stone-400">{item.itemKind} · {item.id}</div>
                          </td>
                          <td className="p-2 text-sky-300">{item.provider}</td>
                          <td className="p-2 text-purple-300">{item.adapter}</td>
                          <td className="p-2 text-amber-200">{item.model}</td>
                          <td className="p-2 text-stone-300">{item.workflow}</td>
                          <td className="p-2">
                            <span className={item.apiKeyStatus === 'MISSING_SECRET' ? 'text-rose-400 font-bold' : 'text-emerald-300'}>
                              {item.apiKeyStatus}
                            </span>
                          </td>
                          <td className="p-2 text-stone-300">{item.billingStatus}</td>
                          <td className="p-2 text-stone-400">{item.quotaOrBalanceStatus}</td>
                          <td className="p-2 text-stone-300">{item.resDurVerification}</td>
                          <td className="p-2 tabular-nums">
                            <span className={item.quoteStatus === 'QUOTED' ? 'text-emerald-300 font-bold' : 'text-amber-300'}>
                              {item.quoteStatus} ({item.creditsQuoted}✦)
                            </span>
                          </td>
                          <td className="p-2">
                            <div
                              className={`font-bold ${
                                item.finalStatus === 'READY_CONFIG'
                                  ? 'text-emerald-400'
                                  : item.finalStatus === 'GUARDED_EVALUATION_ONLY'
                                  ? 'text-purple-300'
                                  : 'text-rose-400'
                              }`}
                            >
                              {item.finalStatus}
                            </div>
                            <div className="text-[9px] text-stone-400">{item.realTestStatus}</div>
                          </td>
                        </tr>
                        {(item.rootCause || item.recommendedSolution) && (
                          <tr className="bg-white/[0.015]">
                            <td colSpan={11} className="px-2.5 py-1.5 font-sans text-[10px]">
                              {item.rootCause && <span className="text-amber-200 mr-3"><strong>Root Cause:</strong> {item.rootCause}</span>}
                              {item.recommendedSolution && <span className="text-sky-300"><strong>Fix:</strong> {item.recommendedSolution}</span>}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* View Switch: Owner-Only Gemini Omni 1.2 Manual Paid Video Test Console */}
        {activeTab === 'omni_test' && (
          <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1 no-scrollbar bg-[#09080d]">
            <div className="p-3.5 rounded-2xl bg-purple-950/25 border border-purple-500/35 space-y-1">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-purple-200">
                  Owner-Only Gemini Omni 1.2 Manual Video Test Console
                </h4>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40">
                  gemini-omni-1.2-flash · Admin Paid Test Console
                </span>
              </div>
              <p className="text-[11px] text-stone-300 leading-relaxed">
                Gemini Omni 1.2 Flash is unlocked for customer video templates with verified per-second tariffs (+40% markup). This manual diagnostic console remains strictly restricted to authorized Owner/Admin accounts for direct paid smoke testing.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/10 space-y-3">
              <div>
                <label className="text-[11px] font-bold text-stone-300 block mb-1">Test Prompt</label>
                <textarea
                  value={omniPrompt}
                  onChange={(e) => setOmniPrompt(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 rounded-xl bg-black border border-white/15 text-xs text-white focus:outline-none focus:border-purple-400 resize-none"
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-stone-300 block mb-1">Duration (sec)</label>
                  <select
                    value={omniDuration}
                    onChange={(e) => {
                      setOmniDuration(Number(e.target.value));
                      setOmniQuote(null);
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-black border border-white/15 text-xs text-white font-mono"
                  >
                    {[4, 5, 6, 8].map((d) => (
                      <option key={d} value={d}>{d}s</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-bold text-stone-300 block mb-1">Resolution</label>
                  <select
                    value={omniResolution}
                    onChange={(e) => {
                      setOmniResolution(e.target.value as '720p' | '1080p');
                      setOmniQuote(null);
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-black border border-white/15 text-xs text-white font-mono"
                  >
                    <option value="720p">720p ($0.15/sec)</option>
                    <option value="1080p">1080p ($0.30/sec)</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={handleQuoteOmniTest}
                    disabled={omniQuoting}
                    className="w-full py-2 px-3 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-bold border border-white/15 cursor-pointer"
                  >
                    {omniQuoting ? 'Calculating...' : 'Preview Cost Quote'}
                  </button>
                </div>
              </div>

              {omniQuote && (
                <div className="p-3 rounded-xl bg-black/50 border border-amber-500/30 flex flex-wrap items-center justify-between gap-2 text-xs font-mono tabular-nums">
                  <div>
                    Estimated API Charge: <strong className="text-amber-300">${omniQuote.estimatedUsd} USD</strong> ({omniQuote.durationSeconds}s @ ${omniQuote.ratePerSecondUsd}/s · {omniQuote.resolution})
                  </div>
                  <span className={omniQuote.hasGeminiKey ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                    {omniQuote.hasGeminiKey ? 'GEMINI_API_KEY PRESENT' : 'GEMINI_API_KEY MISSING'}
                  </span>
                </div>
              )}

              <label className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-950/20 border border-amber-500/30 text-xs text-amber-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={omniConfirmPaid}
                  onChange={(e) => setOmniConfirmPaid(e.target.checked)}
                  className="w-4 h-4 accent-amber-500 cursor-pointer"
                />
                <span>I confirm running a real paid Google Gemini Omni 1.2 API test on my billing account.</span>
              </label>

              <button
                type="button"
                onClick={handleRunOmniPaidTest}
                disabled={!omniConfirmPaid || omniRunning}
                className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-600 text-white font-bold text-xs flex items-center justify-center gap-2 disabled:opacity-40 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-white" />
                <span>{omniRunning ? 'Running Live Omni 1.2 Test...' : 'Run Real Test (Paid)'}</span>
              </button>

              {omniTestError && (
                <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-200 text-xs">
                  {omniTestError}
                </div>
              )}

              {omniTestResult && (
                <div className="p-3 rounded-xl bg-black/60 border border-white/15 space-y-2 text-xs">
                  <div className="flex items-center justify-between font-mono">
                    <span className={omniTestResult.status === 'completed' ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                      {omniTestResult.status.toUpperCase()} ({omniTestResult.id})
                    </span>
                    <span className="text-stone-400">${omniTestResult.estimatedUsd} USD · {omniTestResult.processingTimeMs || 0}ms</span>
                  </div>
                  {omniTestResult.resultVideoUrl && (
                    <video src={omniTestResult.resultVideoUrl} controls playsInline className="w-full max-h-64 rounded-xl bg-black" />
                  )}
                  {omniTestResult.rawSanitizedResponse && (
                    <pre className="p-2 rounded-lg bg-black/80 text-[10px] font-mono text-stone-300 overflow-x-auto max-h-40">
                      {JSON.stringify(omniTestResult.rawSanitizedResponse, null, 2)}
                    </pre>
                  )}
                </div>
              )}
            </div>

            {omniTests.length > 0 && (
              <div className="space-y-2">
                <h5 className="text-[11px] font-bold uppercase tracking-wider text-stone-400">Recent Owner Omni 1.2 Test History</h5>
                <div className="space-y-1.5 max-h-56 overflow-y-auto">
                  {omniTests.map((t) => (
                    <div key={t.id} className="p-2.5 rounded-xl bg-white/[0.02] border border-white/10 text-[11px] font-mono flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className={t.status === 'completed' ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                          [{t.status.toUpperCase()}]
                        </span>{' '}
                        <span className="text-white">{t.durationSeconds}s {t.resolution}</span> · <span className="text-amber-300">${t.estimatedUsd}</span>
                        {t.error && <div className="text-rose-300 text-[10px] mt-0.5">{t.error}</div>}
                      </div>
                      <span className="text-stone-500 text-[10px]">{new Date(t.createdAt).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* View Switch: Run History */}
        {activeTab === 'history' && (
          <div className="p-4 sm:p-5 overflow-y-auto space-y-3 flex-1 no-scrollbar bg-[#09080d]">
            <div className="flex items-center justify-between pb-2 border-b border-white/5">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-sky-400" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-stone-200">
                  Permanent Firestore Run History (diagnostics_history)
                </h4>
                <span
                  className={`text-[9px] px-2 py-0.5 rounded-full font-mono uppercase font-bold border ${
                    historySource === 'firestore_persistent'
                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                      : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                  }`}
                >
                  {historySource === 'firestore_persistent' ? 'Firestore Persistent' : 'In-Memory Ring Buffer'}
                </span>
              </div>
              <button
                onClick={fetchHistory}
                disabled={loadingHistory}
                className="text-[11px] text-[#ff9f00] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className={`w-3 h-3 ${loadingHistory ? 'animate-spin' : ''}`} />
                <span>Refresh History</span>
              </button>
            </div>

            {historyWarning && (
              <div className="p-2.5 rounded-xl bg-amber-950/30 border border-amber-500/40 text-amber-300 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{historyWarning}</span>
              </div>
            )}

            {historyRuns.length === 0 ? (
              <div className="text-center py-12 text-stone-500 text-xs">
                No past diagnostic runs recorded yet in system history.
              </div>
            ) : (
              historyRuns.map((h, idx) => (
                <div
                  key={h.runId || idx}
                  className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/10 space-y-2 hover:border-white/20 transition-all"
                >
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 font-mono">
                      <span className="text-white font-bold">{h.runId}</span>
                      <span className="text-[10px] text-stone-400 bg-white/5 px-2 py-0.5 rounded">
                        Env: {h.environment || 'sandbox'}
                      </span>
                    </div>
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
                        setIsHistoricalSnapshot(true);
                        setActiveTab('audit');
                      }}
                      className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-white text-[11px] font-semibold transition-colors cursor-pointer flex items-center gap-1 border border-white/10"
                    >
                      <span>Load Snapshot</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* View Switch: Audit Probes Tab */}
        {activeTab === 'audit' && (
          <>
            {/* Dynamic Summary Badges & Action Bar */}
            {isHistoricalSnapshot && runSummary && (
              <div className="px-4 sm:px-5 py-2 bg-amber-950/35 border-b border-amber-500/30 text-[11px] text-amber-200 flex items-center justify-between gap-2">
                <span>
                  Viewing <strong>Archived History Snapshot</strong> ({runSummary.runId} · {new Date(runSummary.timestamp).toLocaleString()}). Click <strong>Execute Full Audit</strong> for a live check.
                </span>
              </div>
            )}
            <div className="px-4 sm:px-5 py-3 bg-[#111017] border-b border-white/5 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 flex-wrap font-mono">
                <span className="text-stone-400 text-[11px] font-sans font-semibold">
                  {isHistoricalSnapshot ? 'Archived Snapshot Summary:' : 'Live Audit Summary:'}
                </span>
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
                    All ({totalTestsCount})
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
                      <span>Executing {totalTestsCount} Tests...</span>
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

            {/* Current Diagnostic Module Cards */}
            <div className="p-3 sm:p-5 overflow-y-auto space-y-2.5 flex-1 no-scrollbar bg-[#09080d]">
            {/* Client Media Cache & Storage Guard Telemetry Card */}
            <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2 mb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-bold text-white uppercase tracking-wider">
                    Client Media Cache & Storage Guard
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-mono">
                    IndexedDB LRU
                  </span>
                </div>
                <button
                  onClick={handleClearCache}
                  className="px-2 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-[10px] font-semibold flex items-center gap-1 transition-colors cursor-pointer border border-rose-500/20"
                  title="Purge cached media blobs from browser IndexedDB"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Clear Cache</span>
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono text-[11px]">
                <div className="bg-black/30 p-2 rounded-xl border border-white/5">
                  <span className="text-stone-400 block text-[9px] uppercase tracking-wider">Stored MB</span>
                  <span className="text-white font-bold text-xs">
                    {cacheStats ? (cacheStats.totalBytesStored / (1024 * 1024)).toFixed(2) : '0.00'} MB
                  </span>
                  <span className="text-[9px] text-stone-500 block">Cap: 100 MB</span>
                </div>
                <div className="bg-black/30 p-2 rounded-xl border border-white/5">
                  <span className="text-stone-400 block text-[9px] uppercase tracking-wider">Cached Items</span>
                  <span className="text-amber-300 font-bold text-xs">
                    {cacheStats?.itemCount || 0} Assets
                  </span>
                  <span className="text-[9px] text-stone-500 block">In-Memory: {queueStats?.cacheSize || 0}</span>
                </div>
                <div className="bg-black/30 p-2 rounded-xl border border-white/5">
                  <span className="text-stone-400 block text-[9px] uppercase tracking-wider">Hit / Miss Ratio</span>
                  <span className="text-emerald-400 font-bold text-xs">
                    {cacheStats?.hitCount || 0} Hits / {cacheStats?.missCount || 0} Miss
                  </span>
                  <span className="text-[9px] text-stone-500 block">
                    {cacheStats && (cacheStats.hitCount + cacheStats.missCount > 0)
                      ? `${Math.round((cacheStats.hitCount / (cacheStats.hitCount + cacheStats.missCount)) * 100)}% Rate`
                      : '0% Rate'}
                  </span>
                </div>
                <div className="bg-black/30 p-2 rounded-xl border border-white/5">
                  <span className="text-stone-400 block text-[9px] uppercase tracking-wider">Evictions & Mode</span>
                  <span className="text-sky-400 font-bold text-xs">
                    {cacheStats?.evictionCount || 0} Evicted
                  </span>
                  <span className="text-[9px] text-stone-500 block">
                    {queueStats?.isDataSaver ? 'Data Saver ON' : 'Normal Data'}
                  </span>
                </div>
              </div>
            </div>

            {persistenceStatus && persistenceStatus !== 'PERSISTED' && (
              <div
                className={`p-3 rounded-2xl border text-xs flex items-start gap-2 mb-3 ${
                  persistenceStatus === 'PERSISTENCE_FAILED'
                    ? 'bg-rose-950/35 border-rose-500/50 text-rose-200'
                    : 'bg-amber-950/30 border-amber-500/40 text-amber-200'
                }`}
              >
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold uppercase tracking-wider text-[11px]">
                    {persistenceStatus === 'PERSISTENCE_FAILED'
                      ? 'PERSISTENCE_FAILED / NOT_SAVED'
                      : 'LOCAL_BUFFER_ONLY (Firestore Unavailable)'}
                  </div>
                  <div className="text-[11px] opacity-90 mt-0.5">
                    {persistenceError || 'Diagnostic run completed in process memory; Firestore diagnostics_history was not updated.'}
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between pb-1 text-[11px] text-stone-400">
              <span>Showing {filteredResults.length} of {results.length || 14} Diagnostic Test Modules</span>
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
          </>
        )}
      </motion.div>
    </div>
  );
};
