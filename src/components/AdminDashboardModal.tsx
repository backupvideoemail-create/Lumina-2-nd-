import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import {
  X,
  Shield,
  Cpu,
  Activity,
  ScrollText,
  Copy,
  Check,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  Server,
  ChevronLeft,
  ChevronRight,
  HardDrive,
  Clock,
  Grid,
  Play,
  XCircle
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import firebaseConfig from '../../firebase-applet-config.json';

interface AdminDashboardModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type AdminDashboardTab = 'gallery' | 'diagnostics' | 'health_check' | 'system_health' | 'logs';

interface AdminHealthCheckData {
  authorized: boolean;
  actorEmail: string;
  timestamp: string;
  clientFirebase: {
    projectId: string;
    authDomain: string;
    appId: string;
    storageBucket: string;
  };
  adminSdk: {
    initialized: boolean;
    projectId: string;
    databaseId: string;
  };
  firestoreMode: string;
  databaseId: string;
  sessionPersistence: string;
  cloudRunRevision: string;
  gitCommitSha: string;
  startupTime: string;
  storage: {
    driver: string;
    r2Configured: boolean;
    bucket: string | null;
  };
}

interface SystemHealthData {
  status: string;
  timestamp: string;
  uptimeSeconds: number;
  firestore: {
    status: string;
    latencyMs: number;
    projectId: string;
    databaseId: string;
  };
  storage: {
    driver: string;
    r2Configured: boolean;
    bucket: string | null;
  };
  memory: {
    rssMb: number;
    heapUsedMb: number;
    heapTotalMb: number;
  };
  recentErrorsCount: number;
}

interface AdminLogItem {
  id: string;
  actorEmail: string;
  action: string;
  targetId: string;
  details: string;
  timestamp: string;
}

interface VersionData {
  commitSha: string;
  buildTime: string;
  cloudRunRevision: string;
  catalogueStatus: string;
  catalogRevision: number;
  templateCount: number;
  faceswapSceneCount: number;
  databaseMode: string;
}

interface CatalogSummaryData {
  adminTotalTemplates: number;
  adminActiveTemplates: number;
  adminInactiveTemplates: number;
  quarantinedCount: number;
  bannersTotal: number;
  bannersActive: number;
}

interface DiagnosticRunData {
  runId: string;
  timestamp: string;
  environment: string;
  commitSha: string;
  cloudRunRevision: string;
  overallStatus: string;
  stats: {
    total: number;
    passed: number;
    failed: number;
    blocked: number;
    warning: number;
  };
  results: Array<{
    id: string;
    name: string;
    category: string;
    status: string;
    severity: string;
    actualResult: string;
    failureReason?: string;
  }>;
}

interface AdapterStatusItem {
  id: string;
  name: string;
  status: string;
  connectionStatus: string;
  verificationStatus: string;
}

interface MonitoringAlertItem {
  id?: string;
  title?: string;
  severity?: string;
  resolved?: boolean;
  timestamp?: string;
}

export const AdminDashboardModal: React.FC<AdminDashboardModalProps> = ({ isOpen, onClose }) => {
  const {
    user,
    setTemplateManagerOpen,
    setDiagnosticsModalOpen,
    templates,
    refreshTemplates
  } = useApp();

  const [activeTab, setActiveTab] = useState<AdminDashboardTab>('health_check');

  // Authoritative Health Check state
  const [healthCheck, setHealthCheck] = useState<AdminHealthCheckData | null>(null);
  const [healthCheckError, setHealthCheckError] = useState<string | null>(null);

  // System Health & Metrics state
  const [systemHealth, setSystemHealth] = useState<SystemHealthData | null>(null);
  const [systemHealthError, setSystemHealthError] = useState<string | null>(null);
  const [pingingFirestore, setPingingFirestore] = useState(false);

  // Catalog & Banners state
  const [versionData, setVersionData] = useState<VersionData | null>(null);
  const [catalogSummary, setCatalogSummary] = useState<CatalogSummaryData | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [refreshingCatalog, setRefreshingCatalog] = useState(false);

  // Diagnostics Summary, Adapters & Alerts state
  const [latestDiagRun, setLatestDiagRun] = useState<DiagnosticRunData | null>(null);
  const [diagHistorySource, setDiagHistorySource] = useState<string>('UNAVAILABLE');
  const [diagHistoryWarning, setDiagHistoryWarning] = useState<string | null>(null);
  const [diagError, setDiagError] = useState<string | null>(null);
  const [runningProbes, setRunningProbes] = useState(false);
  const [adapters, setAdapters] = useState<AdapterStatusItem[]>([]);
  const [alerts, setAlerts] = useState<MonitoringAlertItem[]>([]);

  // Admin Logs state
  const [logs, setLogs] = useState<AdminLogItem[]>([]);
  const [totalLogs, setTotalLogs] = useState(0);
  const [logPage, setLogPage] = useState(0);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState<string | null>(null);

  // Global loading & copy feedback
  const [loading, setLoading] = useState(false);
  const [copiedReport, setCopiedReport] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  const pageSize = 15;
  const clientDatabaseId = (firebaseConfig as { firestoreDatabaseId?: string }).firestoreDatabaseId || '(default)';

  const getHeaders = useCallback((): Record<string, string> => {
    const token = localStorage.getItem('lumina_session_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  const readErrorMessage = async (res: Response, fallback: string): Promise<string> => {
    try {
      const json = await res.json();
      if (json?.error) return `${fallback} (HTTP ${res.status}: ${json.error})`;
    } catch {
      // Ignore JSON parse failures on non-JSON error responses
    }
    return `${fallback} (HTTP ${res.status})`;
  };

  // 1. Fetch Admin Health Check
  const fetchHealthCheck = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/health-check', { headers: getHeaders() });
      if (!res.ok) {
        setHealthCheckError(await readErrorMessage(res, 'Failed to load health check'));
        return;
      }
      const data = await res.json();
      setHealthCheck(data);
      setHealthCheckError(null);
    } catch (err: any) {
      setHealthCheckError(err?.message || 'Network error loading health check');
    }
  }, [getHeaders]);

  // 2. Fetch System Health (Latency & memory)
  const fetchSystemHealth = useCallback(async () => {
    setPingingFirestore(true);
    try {
      const res = await fetch('/api/admin/system-health', { headers: getHeaders() });
      if (!res.ok) {
        setSystemHealthError(await readErrorMessage(res, 'Failed to load system health'));
        return;
      }
      const data = await res.json();
      setSystemHealth(data);
      setSystemHealthError(null);
    } catch (err: any) {
      setSystemHealthError(err?.message || 'Network error loading system health');
    } finally {
      setPingingFirestore(false);
    }
  }, [getHeaders]);

  // 3. Fetch Genuine Catalog, Banners & Version Counts
  const fetchCatalogSummary = useCallback(async (forceCloudRefresh = false) => {
    setRefreshingCatalog(true);
    try {
      const headers = getHeaders();
      const tplUrl = forceCloudRefresh ? '/api/admin/templates?refresh=true' : '/api/admin/templates';
      const [tplRes, bannersRes, versionRes, quarantinedRes] = await Promise.all([
        fetch(tplUrl, { headers }),
        fetch('/api/banners'),
        fetch('/api/version'),
        fetch('/api/admin/templates/quarantined', { headers })
      ]);

      if (versionRes.ok) {
        const vJson = await versionRes.json();
        setVersionData(vJson);
      }

      if (!tplRes.ok) {
        setCatalogError(await readErrorMessage(tplRes, 'Failed to load admin templates'));
        return;
      }

      const tplJson = await tplRes.json();
      const adminList = Array.isArray(tplJson?.templates) ? tplJson.templates : [];
      const activeCount = adminList.filter((t: any) => t?.isActive !== false).length;
      const inactiveCount = adminList.length - activeCount;

      let bannersTotal = 0;
      let bannersActive = 0;
      if (bannersRes.ok) {
        const bJson = await bannersRes.json();
        const bList = Array.isArray(bJson?.banners) ? bJson.banners : [];
        bannersTotal = bList.length;
        bannersActive = bList.filter((b: any) => b?.isActive !== false).length;
      }

      let quarantinedCount = 0;
      if (quarantinedRes.ok) {
        const qJson = await quarantinedRes.json();
        quarantinedCount = Array.isArray(qJson?.quarantinedTemplates) ? qJson.quarantinedTemplates.length : 0;
      }

      setCatalogSummary({
        adminTotalTemplates: adminList.length,
        adminActiveTemplates: activeCount,
        adminInactiveTemplates: inactiveCount,
        quarantinedCount,
        bannersTotal,
        bannersActive
      });
      setCatalogError(null);
    } catch (err: any) {
      setCatalogError(err?.message || 'Network error loading catalog summary');
    } finally {
      setRefreshingCatalog(false);
    }
  }, [getHeaders]);

  // 4. Fetch Diagnostics History, Adapters & Monitoring Alerts
  const fetchDiagnosticsSummary = useCallback(async () => {
    try {
      const headers = getHeaders();
      const [histRes, adaptersRes, alertsRes] = await Promise.all([
        fetch('/api/admin/diagnostics/history', { headers }),
        fetch('/api/admin/adapters/status', { headers }),
        fetch('/api/admin/monitoring/alerts', { headers })
      ]);

      if (!histRes.ok) {
        setDiagError(await readErrorMessage(histRes, 'Failed to load diagnostics history'));
      } else {
        const hJson = await histRes.json();
        const runs = Array.isArray(hJson?.history) ? hJson.history : [];
        setLatestDiagRun(runs[0] || null);
        setDiagHistorySource(hJson?.source || 'UNAVAILABLE');
        setDiagHistoryWarning(hJson?.warning || null);
        setDiagError(null);
      }

      if (adaptersRes.ok) {
        const aJson = await adaptersRes.json();
        setAdapters(Array.isArray(aJson?.adapters) ? aJson.adapters : []);
      }

      if (alertsRes.ok) {
        const alJson = await alertsRes.json();
        setAlerts(Array.isArray(alJson?.alerts) ? alJson.alerts : []);
      }
    } catch (err: any) {
      setDiagError(err?.message || 'Network error loading diagnostics summary');
    }
  }, [getHeaders]);

  // Run Live Diagnostic Probes Directly From Tab 2
  const handleRunLiveProbes = useCallback(async () => {
    setRunningProbes(true);
    setDiagError(null);
    try {
      const res = await fetch('/api/admin/diagnostics', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getHeaders()
        }
      });
      if (!res.ok) {
        setDiagError(await readErrorMessage(res, 'Live diagnostic run failed'));
        return;
      }
      const data = await res.json();
      if (data?.runSummary) {
        setLatestDiagRun(data.runSummary);
      }
      await fetchDiagnosticsSummary();
    } catch (err: any) {
      setDiagError(err?.message || 'Network error running live probes');
    } finally {
      setRunningProbes(false);
    }
  }, [getHeaders, fetchDiagnosticsSummary]);

  // 5. Fetch Paginated Logs
  const fetchLogs = useCallback(async (page: number) => {
    setLogsLoading(true);
    try {
      const offset = page * pageSize;
      const res = await fetch(`/api/admin/logs?limit=${pageSize}&offset=${offset}`, { headers: getHeaders() });
      if (!res.ok) {
        setLogsError(await readErrorMessage(res, 'Failed to load admin logs'));
        return;
      }
      const data = await res.json();
      setLogs(Array.isArray(data.logs) ? data.logs : []);
      setTotalLogs(typeof data.total === 'number' ? data.total : 0);
      setLogsError(null);
    } catch (err: any) {
      setLogsError(err?.message || 'Network error loading admin logs');
    } finally {
      setLogsLoading(false);
    }
  }, [getHeaders]);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    await Promise.allSettled([
      fetchHealthCheck(),
      fetchSystemHealth(),
      fetchCatalogSummary(false),
      fetchDiagnosticsSummary(),
      fetchLogs(logPage)
    ]);
    setLoading(false);
  }, [fetchHealthCheck, fetchSystemHealth, fetchCatalogSummary, fetchDiagnosticsSummary, fetchLogs, logPage]);

  // Only trigger initial load when modal opens (not on logPage change, which handles its own fetchLogs)
  useEffect(() => {
    if (isOpen) {
      refreshAll();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Derived truthful checks
  const backendDatabaseId = healthCheck?.adminSdk.databaseId || healthCheck?.databaseId || null;
  const projectMismatch = Boolean(
    healthCheck && healthCheck.clientFirebase.projectId !== healthCheck.adminSdk.projectId
  );
  const databaseMismatch = Boolean(
    backendDatabaseId && clientDatabaseId !== backendDatabaseId
  );
  const unresolvedAlertsCount = alerts.filter((a) => !a.resolved).length;

  // Generate 1-Click Sanitized Diagnostic Markdown Report (Zero fake fallbacks)
  const handleCopyReport = async () => {
    setCopyError(null);
    const now = new Date().toISOString();
    const firestoreLatency = systemHealth?.firestore.latencyMs;
    const r2Status = !healthCheck
      ? 'UNAVAILABLE'
      : healthCheck.storage.r2Configured
      ? 'CONNECTED'
      : 'NOT_CONFIGURED (LOCAL_FALLBACK)';
    const commitSha = healthCheck?.gitCommitSha || versionData?.commitSha || 'UNAVAILABLE';
    const cloudRev = healthCheck?.cloudRunRevision || versionData?.cloudRunRevision || 'UNAVAILABLE';
    const activeActor = user?.email || healthCheck?.actorEmail || 'UNAVAILABLE';

    const reportMarkdown = `
# 🛠️ AI PRIME STUDIO — SYSTEM DIAGNOSTIC REPORT
**Generated At:** \`${now}\`  
**Actor Email:** \`${activeActor}\`  
**Git Commit SHA:** \`${commitSha}\`  
**Cloud Run Revision:** \`${cloudRev}\`  

---

### 1. FIREBASE & AUTHENTICATION CONFIGURATION
- **Client Firebase Project ID:** \`${healthCheck?.clientFirebase.projectId || 'UNAVAILABLE'}\`
- **Client Firestore Database ID:** \`${clientDatabaseId}\`
- **Admin SDK Initialized:** \`${healthCheck ? String(healthCheck.adminSdk.initialized) : 'UNAVAILABLE'}\`
- **Admin SDK Project ID:** \`${healthCheck?.adminSdk.projectId || 'UNAVAILABLE'}\`
- **Backend Firestore Database ID:** \`${backendDatabaseId || 'UNAVAILABLE'}\`
- **Project / Database Parity:** \`${healthCheck ? (projectMismatch || databaseMismatch ? 'MISMATCH_DETECTED' : 'MATCH') : 'NOT_VERIFIED'}\`
- **Session Persistence:** \`${healthCheck?.sessionPersistence || 'UNAVAILABLE'}\`
- **Auth Domain:** \`${healthCheck?.clientFirebase.authDomain || 'UNAVAILABLE'}\`

---

### 2. CATALOGUE & STORAGE INFRASTRUCTURE
- **Catalogue Status:** \`${versionData?.catalogueStatus || 'UNAVAILABLE'}\`
- **Admin Templates (Total / Active / Inactive):** \`${catalogSummary ? `${catalogSummary.adminTotalTemplates} / ${catalogSummary.adminActiveTemplates} / ${catalogSummary.adminInactiveTemplates}` : 'UNAVAILABLE'}\`
- **Public Templates Loaded:** \`${templates.length}\`
- **Quarantined Templates:** \`${catalogSummary ? catalogSummary.quarantinedCount : 'UNAVAILABLE'}\`
- **Hero Banners (Active / Total):** \`${catalogSummary ? `${catalogSummary.bannersActive} / ${catalogSummary.bannersTotal}` : 'UNAVAILABLE'}\`
- **FaceSwap Scenes:** \`${versionData ? versionData.faceswapSceneCount : 'UNAVAILABLE'}\`
- **Active Storage Driver:** \`${healthCheck?.storage.driver || 'UNAVAILABLE'}\`
- **Cloudflare R2 Bucket:** \`${healthCheck?.storage.bucket || 'UNAVAILABLE'}\`
- **R2 Connection Status:** \`${r2Status}\`

---

### 3. LIVE RUNTIME & LATENCY METRICS
- **Firestore Health:** \`${systemHealth?.firestore.status || (systemHealthError ? 'ERROR' : 'UNAVAILABLE')}\`
- **Firestore Roundtrip Latency:** \`${typeof firestoreLatency === 'number' && firestoreLatency >= 0 ? `${firestoreLatency} ms` : 'UNAVAILABLE'}\`
- **Server Uptime:** \`${systemHealth ? `${Math.floor(systemHealth.uptimeSeconds / 60)} min` : 'UNAVAILABLE'}\`
- **Memory RSS:** \`${systemHealth ? `${systemHealth.memory.rssMb} MB` : 'UNAVAILABLE'}\`
- **Heap Used / Total:** \`${systemHealth ? `${systemHealth.memory.heapUsedMb} MB / ${systemHealth.memory.heapTotalMb} MB` : 'UNAVAILABLE'}\`
- **Recent Errors Counter:** \`${systemHealth ? `${systemHealth.recentErrorsCount} (Backend 4xx/5xx window uninstrumented)` : 'UNAVAILABLE'}\`

---

### 4. LATEST DIAGNOSTICS & ADAPTER STATUS
- **Latest Run ID:** \`${latestDiagRun?.runId || 'NOT_TESTED'}\`
- **Latest Run Status:** \`${latestDiagRun ? `${latestDiagRun.overallStatus} (${latestDiagRun.stats.passed}/${latestDiagRun.stats.total} passed, ${latestDiagRun.stats.failed} failed, ${latestDiagRun.stats.blocked} blocked)` : 'NOT_TESTED'}\`
- **History Persistence Source:** \`${diagHistorySource}\`
- **Unresolved Monitoring Alerts:** \`${alerts.length > 0 ? unresolvedAlertsCount : 0}\`
- **AI Adapters:** ${adapters.length > 0 ? adapters.map((a) => `\`${a.id}:${a.status}\``).join(', ') : '`UNAVAILABLE`'}

---

### 5. RECENT ADMIN AUDIT LOGS (${logs.length} of ${totalLogs} total)
${logs.length > 0 ? logs.map((l) => `- **[${String(l?.timestamp || '').slice(0, 19).replace('T', ' ') || 'N/A'}]** \`${l?.action || 'UNKNOWN'}\` by *${l?.actorEmail || 'unknown'}*: ${l?.details || ''}`).join('\n') : logsError ? `- Error loading logs: ${logsError}` : '- Zero admin activity logs recorded.'}

---
*Note: Sanitized report generated by AI Prime Studio Admin System. All secrets, private keys, and tokens strictly excluded.*
`.trim();

    try {
      await navigator.clipboard.writeText(reportMarkdown);
      setCopiedReport(true);
      setTimeout(() => setCopiedReport(false), 2500);
    } catch (err: any) {
      setCopyError(err?.message || 'Clipboard permission denied');
      setTimeout(() => setCopyError(null), 3500);
    }
  };

  if (!isOpen) return null;

  const firestoreStatusText = systemHealth?.firestore.status || '';
  const isFirestoreHealthy = firestoreStatusText === 'HEALTHY';
  const isFirestoreInMemory = firestoreStatusText === 'HEALTHY_IN_MEMORY';

  const tabItems: Array<{
    id: AdminDashboardTab;
    label: string;
    icon: React.ReactNode;
    activeClass: string;
  }> = [
    {
      id: 'gallery',
      label: 'Admin Gallery & Templates',
      icon: <Grid className="w-3.5 h-3.5 shrink-0" />,
      activeClass: 'bg-[#15141c] text-[#ff9f00] border-t-2 border-t-[#ff9f00] border-x border-white/10'
    },
    {
      id: 'diagnostics',
      label: 'System Diagnostics',
      icon: <Cpu className="w-3.5 h-3.5 shrink-0" />,
      activeClass: 'bg-[#15141c] text-emerald-400 border-t-2 border-t-emerald-400 border-x border-white/10'
    },
    {
      id: 'health_check',
      label: 'Admin Health Check',
      icon: <Shield className="w-3.5 h-3.5 shrink-0" />,
      activeClass: 'bg-[#15141c] text-amber-300 border-t-2 border-t-amber-400 border-x border-white/10'
    },
    {
      id: 'system_health',
      label: 'System Health & Metrics',
      icon: <Activity className="w-3.5 h-3.5 shrink-0" />,
      activeClass: 'bg-[#15141c] text-sky-400 border-t-2 border-t-sky-400 border-x border-white/10'
    },
    {
      id: 'logs',
      label: 'Admin Activity Logs',
      icon: <ScrollText className="w-3.5 h-3.5 shrink-0" />,
      activeClass: 'bg-[#15141c] text-purple-400 border-t-2 border-t-purple-400 border-x border-white/10'
    }
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-5 bg-black/85 backdrop-blur-md overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-label="AI Prime Studio Admin Dashboard"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 12 }}
        transition={{ duration: 0.2 }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-4xl h-[92vh] bg-[#0c0c11] border border-white/12 rounded-3xl shadow-[0_25px_70px_rgba(0,0,0,0.9)] flex flex-col overflow-hidden"
      >
        {/* Top Header Bar */}
        <div className="p-3.5 sm:p-5 border-b border-white/10 bg-gradient-to-r from-[#171520] via-[#100f16] to-[#0c0c11] flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#ff9f00] to-[#ea580c] flex items-center justify-center shadow-lg shrink-0">
              <Shield className="w-5 h-5 text-black stroke-[2.5]" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm sm:text-lg font-bold font-display text-white truncate">
                  AI Prime Studio Admin Dashboard
                </h3>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#ff9f00]">
                  Dual-Admin
                </span>
              </div>
              <p className="text-xs text-stone-400 truncate">
                Verified: <span className="text-stone-200 font-medium">{user?.email || healthCheck?.actorEmail || 'Unverified'}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* 1-Click Copy Diagnostic Report */}
            <button
              type="button"
              onClick={handleCopyReport}
              className="min-h-[40px] px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/40 hover:border-amber-400 text-amber-200 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
              title="Copy genuine sanitized Markdown report"
            >
              {copiedReport ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Report Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-amber-300" />
                  <span className="hidden xs:inline sm:inline">Copy Diagnostic Report</span>
                  <span className="sm:hidden">Copy Report</span>
                </>
              )}
            </button>

            {/* Refresh Button */}
            <button
              type="button"
              onClick={refreshAll}
              disabled={loading}
              aria-label="Refresh Dashboard Data"
              className="min-h-[40px] min-w-[40px] p-2 rounded-xl bg-white/5 hover:bg-white/10 text-stone-400 hover:text-white transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center"
              title="Refresh Dashboard Data"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-[#ff9f00]' : ''}`} />
            </button>

            {/* Root Close Button */}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Admin Dashboard"
              className="min-h-[40px] min-w-[40px] p-2 rounded-xl bg-white/5 hover:bg-white/10 text-stone-400 hover:text-white transition-colors cursor-pointer flex items-center justify-center"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Five Navigation Tabs */}
        <div
          role="tablist"
          aria-label="Admin Dashboard Sections"
          className="px-3 sm:px-4 pt-2.5 border-b border-white/5 bg-black/40 flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0"
        >
          {tabItems.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={(e) => {
                e.stopPropagation();
                setActiveTab(tab.id);
              }}
              className={`min-h-[44px] px-3 py-2 rounded-t-xl text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === tab.id
                  ? tab.activeClass
                  : 'text-stone-400 hover:text-white hover:bg-white/5'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Tab Body Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {/* Copy / Mismatch Alerts */}
          {copyError && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Copy failed: {copyError}</span>
            </div>
          )}

          {(projectMismatch || databaseMismatch) && (
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/40 text-xs text-amber-200 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-amber-300">Firebase Configuration Parity Alert</p>
                <p className="text-amber-200/80 mt-0.5">
                  Client DB: <code className="font-mono">{clientDatabaseId}</code> | Backend DB:{' '}
                  <code className="font-mono">{backendDatabaseId || 'UNAVAILABLE'}</code> | Client Project:{' '}
                  <code className="font-mono">{healthCheck?.clientFirebase.projectId}</code> | Admin SDK Project:{' '}
                  <code className="font-mono">{healthCheck?.adminSdk.projectId}</code>
                </p>
              </div>
            </div>
          )}

          {/* TAB 1: Gallery & Templates Quick Management */}
          {activeTab === 'gallery' && (
            <div className="space-y-5" role="tabpanel" aria-label="Admin Gallery & Templates">
              <div className="p-5 rounded-2xl bg-gradient-to-br from-[#1a1510] to-[#100f14] border border-[#ff9f00]/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h4 className="text-base font-bold text-white flex items-center gap-2">
                    <Grid className="w-4 h-4 text-[#ff9f00]" />
                    <span>Template Manager & Catalog Management</span>
                  </h4>
                  <p className="text-xs text-stone-300 mt-1 max-w-xl">
                    Add new templates from your device gallery, adjust execution prompts, set credit pricing, and manage homepage hero banners.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={async () => {
                      await Promise.allSettled([fetchCatalogSummary(true), refreshTemplates()]);
                    }}
                    disabled={refreshingCatalog}
                    className="min-h-[42px] px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-stone-200 font-semibold text-xs flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${refreshingCatalog ? 'animate-spin text-[#ff9f00]' : ''}`} />
                    <span>Sync Catalog</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      setTemplateManagerOpen(true);
                    }}
                    className="min-h-[42px] px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#ff9f00] to-[#ea580c] text-black font-bold text-xs flex items-center gap-2 shadow-lg cursor-pointer hover:brightness-110"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Open Full Template Manager</span>
                  </button>
                </div>
              </div>

              {catalogError && (
                <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300 flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{catalogError}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => fetchCatalogSummary(false)}
                    className="px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 font-semibold cursor-pointer"
                  >
                    Retry
                  </button>
                </div>
              )}

              {/* Genuine Authoritative Catalog Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                  <span className="text-[11px] text-stone-400 block">Admin Templates (Total)</span>
                  <span className="text-2xl font-bold font-mono tabular-nums text-white mt-1 block">
                    {catalogSummary ? catalogSummary.adminTotalTemplates : loading ? '…' : 'UNAVAILABLE'}
                  </span>
                  <span className="text-[11px] text-stone-400 mt-1 block font-mono tabular-nums">
                    {catalogSummary
                      ? `${catalogSummary.adminActiveTemplates} active · ${catalogSummary.adminInactiveTemplates} hidden`
                      : `Public UI: ${templates.length}`}
                  </span>
                </div>

                <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                  <span className="text-[11px] text-stone-400 block">Hero Banners (Persisted)</span>
                  <span className="text-2xl font-bold font-mono tabular-nums text-[#ff9f00] mt-1 block">
                    {catalogSummary ? catalogSummary.bannersActive : loading ? '…' : 'UNAVAILABLE'}
                  </span>
                  <span className="text-[11px] text-stone-400 mt-1 block font-mono tabular-nums">
                    {catalogSummary ? `${catalogSummary.bannersTotal} total persisted` : 'From /api/banners'}
                  </span>
                </div>

                <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                  <span className="text-[11px] text-stone-400 block">Active Storage Driver</span>
                  <span
                    className={`text-sm font-bold mt-2 block truncate ${
                      !healthCheck
                        ? 'text-stone-400'
                        : healthCheck.storage.r2Configured
                        ? 'text-emerald-400'
                        : 'text-amber-300'
                    }`}
                  >
                    {!healthCheck
                      ? loading
                        ? 'Checking…'
                        : 'UNAVAILABLE'
                      : healthCheck.storage.r2Configured
                      ? 'Cloudflare R2 (Connected)'
                      : 'Local Storage (R2 Pending)'}
                  </span>
                  <span className="text-[11px] text-stone-400 mt-1 block truncate font-mono">
                    {healthCheck?.storage.bucket || 'No R2 bucket active'}
                  </span>
                </div>

                <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                  <span className="text-[11px] text-stone-400 block">Catalogue & Scenes</span>
                  <span
                    className={`text-sm font-bold mt-2 block ${
                      versionData?.catalogueStatus === 'READY'
                        ? 'text-emerald-400'
                        : versionData?.catalogueStatus === 'EMPTY'
                        ? 'text-amber-300'
                        : 'text-stone-300'
                    }`}
                  >
                    {versionData ? versionData.catalogueStatus : loading ? 'Checking…' : 'UNAVAILABLE'}
                  </span>
                  <span className="text-[11px] text-stone-400 mt-1 block font-mono tabular-nums">
                    {versionData ? `${versionData.faceswapSceneCount} FaceSwap scenes` : 'From /api/version'}
                  </span>
                </div>
              </div>

              {catalogSummary && catalogSummary.quarantinedCount > 0 && (
                <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>
                    <strong className="font-mono tabular-nums">{catalogSummary.quarantinedCount}</strong> quarantined template(s) excluded due to incomplete schema/media validation.
                  </span>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: System Diagnostics */}
          {activeTab === 'diagnostics' && (
            <div className="space-y-5" role="tabpanel" aria-label="System Diagnostics">
              <div className="p-5 rounded-2xl bg-gradient-to-br from-[#0e1a14] to-[#0c1210] border border-emerald-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h4 className="text-base font-bold text-white flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-emerald-400" />
                    <span>Automated Diagnostic Suite & Live Probes</span>
                  </h4>
                  <p className="text-xs text-stone-300 mt-1 max-w-xl">
                    Run live server probes across Firebase, Google Cloud, Razorpay, Cloudflare R2, and AI generation adapters.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleRunLiveProbes}
                    disabled={runningProbes}
                    className="min-h-[42px] px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-emerald-500/40 text-emerald-200 font-bold text-xs flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {runningProbes ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                    ) : (
                      <Play className="w-3.5 h-3.5 fill-emerald-300 text-emerald-300" />
                    )}
                    <span>{runningProbes ? 'Running Probes…' : 'Run Live Probes'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      setDiagnosticsModalOpen(true);
                    }}
                    className="min-h-[42px] px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-black font-bold text-xs flex items-center gap-2 shadow-lg cursor-pointer hover:brightness-110"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Launch Diagnostics Modal</span>
                  </button>
                </div>
              </div>

              {diagError && (
                <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300 flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{diagError}</span>
                  </span>
                  <button
                    type="button"
                    onClick={fetchDiagnosticsSummary}
                    className="px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 font-semibold cursor-pointer"
                  >
                    Retry
                  </button>
                </div>
              )}

              {/* Genuine Latest Run Summary */}
              <div className="p-4 rounded-xl bg-black/40 border border-white/10 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-stone-200 uppercase tracking-wider">
                    {latestDiagRun ? (
                      latestDiagRun.overallStatus === 'HEALTHY' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-amber-400" />
                      )
                    ) : (
                      <Cpu className="w-4 h-4 text-stone-400" />
                    )}
                    <span>Latest Server Diagnostic Run</span>
                  </div>
                  <span className="text-[11px] font-mono text-stone-400">
                    History Source: {diagHistorySource}
                  </span>
                </div>

                {latestDiagRun ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-xs">
                      <div className="p-2.5 rounded-lg bg-white/5 border border-white/5">
                        <span className="text-[10px] text-stone-400 block">Overall Status</span>
                        <span
                          className={`font-bold mt-0.5 block ${
                            latestDiagRun.overallStatus === 'HEALTHY'
                              ? 'text-emerald-400'
                              : latestDiagRun.overallStatus === 'ACTION_REQUIRED'
                              ? 'text-rose-400'
                              : 'text-amber-300'
                          }`}
                        >
                          {latestDiagRun.overallStatus}
                        </span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-white/5 border border-white/5">
                        <span className="text-[10px] text-stone-400 block">Passed</span>
                        <span className="font-mono tabular-nums font-bold text-emerald-400 mt-0.5 block">
                          {latestDiagRun.stats.passed} / {latestDiagRun.stats.total}
                        </span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-white/5 border border-white/5">
                        <span className="text-[10px] text-stone-400 block">Failed</span>
                        <span className="font-mono tabular-nums font-bold text-rose-400 mt-0.5 block">
                          {latestDiagRun.stats.failed}
                        </span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-white/5 border border-white/5">
                        <span className="text-[10px] text-stone-400 block">Blocked / Warn</span>
                        <span className="font-mono tabular-nums font-bold text-amber-300 mt-0.5 block">
                          {latestDiagRun.stats.blocked} / {latestDiagRun.stats.warning}
                        </span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-white/5 border border-white/5">
                        <span className="text-[10px] text-stone-400 block">Run Time</span>
                        <span className="font-mono tabular-nums text-stone-200 mt-0.5 block truncate">
                          {latestDiagRun.timestamp ? new Date(latestDiagRun.timestamp).toLocaleTimeString() : 'N/A'}
                        </span>
                      </div>
                    </div>
                    <p className="text-[11px] font-mono text-stone-400">
                      Run ID: {latestDiagRun.runId} · Env: {latestDiagRun.environment} · Unresolved Monitoring Alerts:{' '}
                      <span className={unresolvedAlertsCount > 0 ? 'text-rose-400 font-bold' : 'text-stone-200'}>
                        {unresolvedAlertsCount}
                      </span>
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-stone-400 leading-relaxed">
                    {loading
                      ? 'Loading diagnostic run history…'
                      : 'No server diagnostic run recorded yet. Click "Run Live Probes" above or "Launch Diagnostics Modal" to execute the live probes.'}
                  </p>
                )}

                {diagHistoryWarning && (
                  <p className="text-[11px] text-amber-300/90 border-t border-white/5 pt-2">
                    Note: {diagHistoryWarning}
                  </p>
                )}
              </div>

              {/* Real AI & Storage Adapter Readiness */}
              <div className="rounded-xl border border-white/10 bg-black/30 overflow-hidden">
                <div className="px-4 py-2.5 bg-white/5 border-b border-white/10 flex items-center justify-between text-xs font-semibold text-stone-300">
                  <span>Live Adapter Readiness (/api/admin/adapters/status)</span>
                  <span className="font-mono text-[11px] text-stone-400">{adapters.length} adapters</span>
                </div>
                {adapters.length > 0 ? (
                  <div className="divide-y divide-white/5">
                    {adapters.map((ad) => {
                      const statusText = typeof ad?.status === 'string' ? ad.status : 'UNKNOWN';
                      return (
                        <div key={ad.id} className="px-4 py-2.5 flex items-center justify-between gap-3 text-xs">
                          <div className="min-w-0">
                            <span className="font-semibold text-white block truncate">{ad.name}</span>
                            <span className="text-[11px] font-mono text-stone-400">{ad.id}</span>
                          </div>
                          <span
                            className={`font-mono text-[11px] font-bold shrink-0 ${
                              statusText.startsWith('CONFIGURED')
                                ? 'text-emerald-400'
                                : statusText === 'MISSING_SECRET'
                                ? 'text-rose-400'
                                : 'text-amber-300'
                            }`}
                          >
                            {statusText}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="p-4 text-xs text-stone-400">
                    {loading ? 'Loading adapter status…' : 'Adapter status unavailable.'}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: Admin Health Check Table */}
          {activeTab === 'health_check' && (
            <div className="space-y-4" role="tabpanel" aria-label="Admin Health Check">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <Shield className="w-4 h-4 text-amber-400" />
                  <span>Authoritative Project & Session Configuration</span>
                </h4>
                <span className="text-[11px] text-stone-400 font-mono tabular-nums">
                  {healthCheck
                    ? `Checked: ${new Date(healthCheck.timestamp).toLocaleTimeString()}`
                    : loading
                    ? 'Checking…'
                    : 'UNAVAILABLE'}
                </span>
              </div>

              {healthCheckError && (
                <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300 flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2">
                    <XCircle className="w-4 h-4 shrink-0" />
                    <span>{healthCheckError}</span>
                  </span>
                  <button
                    type="button"
                    onClick={fetchHealthCheck}
                    className="px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 font-semibold cursor-pointer"
                  >
                    Retry
                  </button>
                </div>
              )}

              <div className="rounded-2xl border border-white/10 overflow-x-auto bg-black/30">
                <table className="w-full text-left text-xs min-w-[560px]">
                  <thead className="bg-white/5 border-b border-white/10 text-stone-400 font-semibold uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="py-3 px-4">Component</th>
                      <th className="py-3 px-4">Actual Value</th>
                      <th className="py-3 px-4">Expected / Target</th>
                      <th className="py-3 px-4">Real Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-stone-300">
                    <tr>
                      <td className="py-3 px-4 font-semibold text-white">Client Firebase Project</td>
                      <td className="py-3 px-4 font-mono text-amber-200">
                        {healthCheck?.clientFirebase.projectId || (loading ? 'Loading…' : 'UNAVAILABLE')}
                      </td>
                      <td className="py-3 px-4 font-mono text-stone-400">ai-prime-studio</td>
                      <td className="py-3 px-4 font-mono text-[11px] font-bold">
                        {!healthCheck ? (
                          <span className="text-stone-400">NOT_VERIFIED</span>
                        ) : healthCheck.clientFirebase.projectId === 'ai-prime-studio' ? (
                          <span className="text-emerald-400">MATCH</span>
                        ) : (
                          <span className="text-rose-400">MISMATCH</span>
                        )}
                      </td>
                    </tr>

                    <tr>
                      <td className="py-3 px-4 font-semibold text-white">Admin SDK Project ID</td>
                      <td className="py-3 px-4 font-mono text-amber-200">
                        {healthCheck?.adminSdk.projectId || (loading ? 'Loading…' : 'UNAVAILABLE')}
                      </td>
                      <td className="py-3 px-4 font-mono text-stone-400">ai-prime-studio</td>
                      <td className="py-3 px-4 font-mono text-[11px] font-bold">
                        {!healthCheck ? (
                          <span className="text-stone-400">NOT_VERIFIED</span>
                        ) : !healthCheck.adminSdk.initialized ? (
                          <span className="text-rose-400">NOT_INITIALIZED</span>
                        ) : projectMismatch ? (
                          <span className="text-rose-400">MISMATCH</span>
                        ) : (
                          <span className="text-emerald-400">INITIALIZED</span>
                        )}
                      </td>
                    </tr>

                    <tr>
                      <td className="py-3 px-4 font-semibold text-white">Firestore Database ID (Client vs Backend)</td>
                      <td className="py-3 px-4 font-mono text-amber-200">
                        {backendDatabaseId ? `${clientDatabaseId} / ${backendDatabaseId}` : loading ? 'Loading…' : 'UNAVAILABLE'}
                      </td>
                      <td className="py-3 px-4 font-mono text-stone-400">(default) / (default)</td>
                      <td className="py-3 px-4 font-mono text-[11px] font-bold">
                        {!healthCheck ? (
                          <span className="text-stone-400">NOT_VERIFIED</span>
                        ) : databaseMismatch ? (
                          <span className="text-rose-400">MISMATCH</span>
                        ) : backendDatabaseId === '(default)' ? (
                          <span className="text-emerald-400">MATCH</span>
                        ) : (
                          <span className="text-amber-300">NON_DEFAULT</span>
                        )}
                      </td>
                    </tr>

                    <tr>
                      <td className="py-3 px-4 font-semibold text-white">Session Persistence</td>
                      <td className="py-3 px-4 font-mono text-amber-200">
                        {healthCheck?.sessionPersistence || (loading ? 'Loading…' : 'UNAVAILABLE')}
                      </td>
                      <td className="py-3 px-4 font-mono text-stone-400">Durable</td>
                      <td className="py-3 px-4 font-mono text-[11px] font-bold">
                        {!healthCheck ? (
                          <span className="text-stone-400">NOT_VERIFIED</span>
                        ) : healthCheck.adminSdk.initialized ? (
                          <span className="text-emerald-400">CONFIGURED</span>
                        ) : (
                          <span className="text-amber-300">LOCAL_ONLY</span>
                        )}
                      </td>
                    </tr>

                    <tr>
                      <td className="py-3 px-4 font-semibold text-white">Storage Driver / Cloudflare R2</td>
                      <td className="py-3 px-4 font-mono text-amber-200">
                        {healthCheck
                          ? `${healthCheck.storage.driver}${healthCheck.storage.bucket ? ` (${healthCheck.storage.bucket})` : ''}`
                          : loading
                          ? 'Loading…'
                          : 'UNAVAILABLE'}
                      </td>
                      <td className="py-3 px-4 font-mono text-stone-400">R2 Authoritative</td>
                      <td className="py-3 px-4 font-mono text-[11px] font-bold">
                        {!healthCheck ? (
                          <span className="text-stone-400">NOT_VERIFIED</span>
                        ) : healthCheck.storage.r2Configured ? (
                          <span className="text-emerald-400">CONNECTED</span>
                        ) : (
                          <span className="text-amber-300">LOCAL_FALLBACK</span>
                        )}
                      </td>
                    </tr>

                    <tr>
                      <td className="py-3 px-4 font-semibold text-white">Git Commit SHA</td>
                      <td className="py-3 px-4 font-mono text-stone-300">
                        {healthCheck?.gitCommitSha || (loading ? 'Loading…' : 'UNAVAILABLE')}
                      </td>
                      <td className="py-3 px-4 font-mono text-stone-400">Main HEAD</td>
                      <td className="py-3 px-4 font-mono text-[11px] font-bold">
                        {!healthCheck ? (
                          <span className="text-stone-400">NOT_VERIFIED</span>
                        ) : healthCheck.gitCommitSha === 'UNVERIFIED/BLOCKED' || !healthCheck.gitCommitSha ? (
                          <span className="text-amber-300">UNVERIFIED</span>
                        ) : (
                          <span className="text-sky-400">PRESENT</span>
                        )}
                      </td>
                    </tr>

                    <tr>
                      <td className="py-3 px-4 font-semibold text-white">Cloud Run Revision</td>
                      <td className="py-3 px-4 font-mono text-stone-300">
                        {healthCheck?.cloudRunRevision || (loading ? 'Loading…' : 'UNAVAILABLE')}
                      </td>
                      <td className="py-3 px-4 font-mono text-stone-400">GCP Service</td>
                      <td className="py-3 px-4 font-mono text-[11px] font-bold">
                        {!healthCheck ? (
                          <span className="text-stone-400">NOT_VERIFIED</span>
                        ) : healthCheck.cloudRunRevision === 'local-dev' ? (
                          <span className="text-amber-300">LOCAL_DEV</span>
                        ) : (
                          <span className="text-emerald-400">CLOUD_RUN</span>
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: System Health & Metrics */}
          {activeTab === 'system_health' && (
            <div className="space-y-5" role="tabpanel" aria-label="System Health & Metrics">
              {systemHealthError && (
                <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300 flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2">
                    <XCircle className="w-4 h-4 shrink-0" />
                    <span>{systemHealthError}</span>
                  </span>
                  <button
                    type="button"
                    onClick={fetchSystemHealth}
                    className="px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 font-semibold cursor-pointer"
                  >
                    Retry
                  </button>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Latency Card */}
                <div className="p-5 rounded-2xl bg-black/40 border border-white/10 space-y-2">
                  <div className="flex items-center justify-between text-xs text-stone-400">
                    <span className="flex items-center gap-1.5 font-semibold">
                      <Clock className="w-4 h-4 text-sky-400" />
                      <span>Firestore Latency Probe</span>
                    </span>
                    <button
                      type="button"
                      onClick={fetchSystemHealth}
                      disabled={pingingFirestore}
                      className="min-h-[32px] px-2 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-[11px] text-sky-300 flex items-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3 h-3 ${pingingFirestore ? 'animate-spin' : ''}`} />
                      <span>Ping</span>
                    </button>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-extrabold font-mono tabular-nums text-white">
                      {systemHealth && systemHealth.firestore.latencyMs >= 0
                        ? `${systemHealth.firestore.latencyMs}`
                        : loading || pingingFirestore
                        ? '…'
                        : 'UNAVAILABLE'}
                    </span>
                    {systemHealth && systemHealth.firestore.latencyMs >= 0 && (
                      <span className="text-xs text-sky-400 font-bold">ms roundtrip</span>
                    )}
                  </div>
                  <span
                    className={`text-[11px] block font-medium break-words ${
                      !systemHealth
                        ? 'text-stone-400'
                        : isFirestoreHealthy
                        ? 'text-emerald-400'
                        : isFirestoreInMemory
                        ? 'text-amber-300'
                        : 'text-rose-400'
                    }`}
                  >
                    Status: {systemHealth ? systemHealth.firestore.status : loading ? 'Probing…' : 'UNAVAILABLE'}
                  </span>
                </div>

                {/* Storage Driver Card */}
                <div className="p-5 rounded-2xl bg-black/40 border border-white/10 space-y-2">
                  <span className="flex items-center gap-1.5 text-xs text-stone-400 font-semibold">
                    <HardDrive className="w-4 h-4 text-emerald-400" />
                    <span>Storage Driver</span>
                  </span>
                  <div className="text-xl font-bold font-display text-white truncate">
                    {!systemHealth
                      ? loading
                        ? 'Checking…'
                        : 'UNAVAILABLE'
                      : systemHealth.storage.r2Configured
                      ? `Cloudflare R2 (${systemHealth.storage.driver})`
                      : `Local (${systemHealth.storage.driver})`}
                  </div>
                  <span className="text-[11px] text-stone-400 block truncate font-mono">
                    Bucket: {systemHealth ? systemHealth.storage.bucket || 'NOT_CONFIGURED' : 'UNAVAILABLE'}
                  </span>
                </div>

                {/* Memory RSS Card */}
                <div className="p-5 rounded-2xl bg-black/40 border border-white/10 space-y-2">
                  <span className="flex items-center gap-1.5 text-xs text-stone-400 font-semibold">
                    <Server className="w-4 h-4 text-purple-400" />
                    <span>Container Memory</span>
                  </span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-extrabold font-mono tabular-nums text-white">
                      {systemHealth ? systemHealth.memory.rssMb : loading ? '…' : 'UNAVAILABLE'}
                    </span>
                    {systemHealth && <span className="text-xs text-purple-400 font-bold">MB RSS</span>}
                  </div>
                  <span className="text-[11px] text-stone-400 block font-mono tabular-nums">
                    {systemHealth
                      ? `Heap: ${systemHealth.memory.heapUsedMb} / ${systemHealth.memory.heapTotalMb} MB`
                      : 'Heap: UNAVAILABLE'}
                  </span>
                </div>
              </div>

              {/* Uptime and API Error Counter */}
              <div className="p-4 rounded-xl bg-white/5 border border-white/10 flex flex-wrap items-center justify-between gap-3 text-xs text-stone-300">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-2.5 h-2.5 rounded-full ${
                      systemHealth ? 'bg-emerald-400 animate-pulse' : 'bg-stone-500'
                    }`}
                  />
                  <span>
                    Uptime:{' '}
                    <strong className="text-white font-mono tabular-nums">
                      {systemHealth ? `${Math.floor(systemHealth.uptimeSeconds / 60)} minutes` : 'UNAVAILABLE'}
                    </strong>
                  </span>
                </div>
                <div className="text-stone-400">
                  API Error Counter:{' '}
                  <strong className="text-amber-300 font-mono tabular-nums">
                    {systemHealth
                      ? `${systemHealth.recentErrorsCount} (4xx/5xx window not instrumented in backend yet)`
                      : 'UNAVAILABLE'}
                  </strong>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: Admin Activity Logs */}
          {activeTab === 'logs' && (
            <div className="space-y-4" role="tabpanel" aria-label="Admin Activity Logs">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <ScrollText className="w-4 h-4 text-purple-400" />
                    <span>Durable Admin Audit Trail</span>
                  </h4>
                  <p className="text-[11px] text-stone-400">
                    Fetched from <code className="text-amber-300">/api/admin/logs</code> (Page {logPage + 1}).
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-stone-400 font-mono tabular-nums">
                    Total: {totalLogs} events
                  </span>
                  <button
                    type="button"
                    onClick={() => fetchLogs(logPage)}
                    disabled={logsLoading}
                    className="min-h-[36px] px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-stone-200 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${logsLoading ? 'animate-spin text-purple-400' : ''}`} />
                    <span>Refresh</span>
                  </button>
                </div>
              </div>

              {logsError && (
                <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300 flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2">
                    <XCircle className="w-4 h-4 shrink-0" />
                    <span>{logsError}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => fetchLogs(logPage)}
                    className="px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 font-semibold cursor-pointer"
                  >
                    Retry
                  </button>
                </div>
              )}

              <div className="rounded-2xl border border-white/10 overflow-x-auto bg-black/30">
                <table className="w-full text-left text-xs min-w-[600px]">
                  <thead className="bg-white/5 border-b border-white/10 text-stone-400 font-semibold uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="py-2.5 px-3">Timestamp</th>
                      <th className="py-2.5 px-3">Actor</th>
                      <th className="py-2.5 px-3">Action</th>
                      <th className="py-2.5 px-3">Target ID</th>
                      <th className="py-2.5 px-3">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-stone-300">
                    {logsLoading && logs.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-stone-400">
                          Loading admin activity logs…
                        </td>
                      </tr>
                    ) : logs.length > 0 ? (
                      logs.map((log) => (
                        <tr key={log.id} className="hover:bg-white/5 transition-colors">
                          <td className="py-2.5 px-3 font-mono tabular-nums text-[11px] text-stone-400 whitespace-nowrap">
                            {String(log?.timestamp || '').slice(0, 19).replace('T', ' ') || 'N/A'}
                          </td>
                          <td className="py-2.5 px-3 font-medium text-amber-200 truncate max-w-[160px]">
                            {log.actorEmail}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-[10px] font-bold whitespace-nowrap">
                            <span
                              className={
                                log.action.includes('CREATED')
                                  ? 'text-emerald-400'
                                  : log.action.includes('DELETED')
                                  ? 'text-rose-400'
                                  : log.action.includes('UPDATED')
                                  ? 'text-amber-300'
                                  : 'text-purple-400'
                              }
                            >
                              {log.action}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-[11px] text-stone-400 truncate max-w-[140px]">
                            {log.targetId}
                          </td>
                          <td className="py-2.5 px-3 text-stone-200">
                            {log.details}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-stone-500">
                          {logsError ? 'Unable to load admin activity logs.' : 'No admin activity logs recorded yet.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalLogs > pageSize && (
                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    disabled={logPage === 0 || logsLoading}
                    onClick={() => {
                      const next = Math.max(0, logPage - 1);
                      setLogPage(next);
                      fetchLogs(next);
                    }}
                    className="min-h-[40px] px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-stone-300 disabled:opacity-40 flex items-center gap-1 cursor-pointer"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span>Previous</span>
                  </button>
                  <span className="text-xs text-stone-400 font-mono tabular-nums">
                    Page {logPage + 1} of {Math.ceil(totalLogs / pageSize)}
                  </span>
                  <button
                    type="button"
                    disabled={(logPage + 1) * pageSize >= totalLogs || logsLoading}
                    onClick={() => {
                      const next = logPage + 1;
                      setLogPage(next);
                      fetchLogs(next);
                    }}
                    className="min-h-[40px] px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-stone-300 disabled:opacity-40 flex items-center gap-1 cursor-pointer"
                  >
                    <span>Next</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

