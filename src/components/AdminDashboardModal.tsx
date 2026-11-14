import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  XCircle,
  Server,
  HardDrive,
  Clock,
  Grid,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import firebaseConfig from '../../firebase-applet-config.json';
import { mediaCacheStorage, MediaCacheTelemetry } from '../services/media/mediaCacheStorage';
import { getQueueStats, QueueStats } from '../services/media/hdDownloadQueue';
import { AUTHORIZED_ADMIN_EMAILS } from '../config/adminConfig';

interface AdminDashboardModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface AdminHealthCheckData {
  authorized: boolean;
  actorEmail: string | null;
  timestamp: string;
  environment?: string;
  appVersion?: string;
  clientFirebase: {
    projectId: string | null;
    firestoreDatabaseId?: string | null;
    authDomain: string | null;
    appId: string | null;
    storageBucket: string | null;
  };
  adminSdk: {
    initialized: boolean;
    projectId: string | null;
    databaseId: string | null;
  };
  firestoreMode: string;
  databaseId: string | null;
  sessionPersistence: string;
  cloudRunRevision: string;
  gitCommitSha: string;
  startupTime: string;
  storage: {
    driver: string;
    r2Configured: boolean;
    bucket: string | null;
    missingEnvVars?: string[];
  };
}

interface RecentApiErrorItem {
  timestamp: string;
  method: string;
  path: string;
  status: number;
}

interface SystemHealthData {
  status: string;
  timestamp: string;
  uptimeSeconds: number;
  firestore: {
    status: string;
    latencyMs: number;
    projectId: string | null;
    databaseId: string | null;
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
  recentErrorsWindowMinutes?: number;
  recentApiErrors?: RecentApiErrorItem[];
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

interface AdminLogItem {
  id: string;
  actorEmail: string;
  action: string;
  targetId: string;
  details: string;
  timestamp: string;
}

interface DiagnosticProbeResultItem {
  id: string;
  name: string;
  category: string;
  status: string;
  severity: string;
  testType?: string;
  endpointOrProvider: string;
  actualResult: string;
  failureReason?: string;
  durationMs: number;
}

interface DiagnosticRunRecord {
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
  results: DiagnosticProbeResultItem[];
}

interface MonitoringAlertItem {
  id: string;
  vector?: string;
  severity?: string;
  message?: string;
  title?: string;
  resolved?: boolean;
  timestamp: string;
  safeTraceId?: string;
}

type DashboardTab = 'gallery' | 'diagnostics' | 'health_check' | 'system_health' | 'logs';

export const AdminDashboardModal: React.FC<AdminDashboardModalProps> = ({ isOpen, onClose }) => {
  const {
    user,
    setTemplateManagerOpen,
    setDiagnosticsModalOpen,
    templates
  } = useApp();

  const [activeTab, setActiveTab] = useState<DashboardTab>('health_check');

  // Section states & explicit error tracking (never mask failures as healthy)
  const [healthCheck, setHealthCheck] = useState<AdminHealthCheckData | null>(null);
  const [healthCheckError, setHealthCheckError] = useState<string | null>(null);

  const [systemHealth, setSystemHealth] = useState<SystemHealthData | null>(null);
  const [systemHealthError, setSystemHealthError] = useState<string | null>(null);
  const [pingingFirestore, setPingingFirestore] = useState(false);

  const [versionInfo, setVersionInfo] = useState<VersionData | null>(null);
  const [versionError, setVersionError] = useState<string | null>(null);

  const [banners, setBanners] = useState<any[] | null>(null);
  const [bannersError, setBannersError] = useState<string | null>(null);

  const [adminTemplates, setAdminTemplates] = useState<any[] | null>(null);
  const [adminTemplatesError, setAdminTemplatesError] = useState<string | null>(null);

  const [diagHistory, setDiagHistory] = useState<DiagnosticRunRecord[] | null>(null);
  const [diagHistorySource, setDiagHistorySource] = useState<string>('UNAVAILABLE');
  const [diagHistoryWarning, setDiagHistoryWarning] = useState<string | null>(null);
  const [diagHistoryError, setDiagHistoryError] = useState<string | null>(null);

  const [alerts, setAlerts] = useState<MonitoringAlertItem[] | null>(null);
  const [alertsError, setAlertsError] = useState<string | null>(null);

  const [cacheStats, setCacheStats] = useState<MediaCacheTelemetry | null>(null);
  const [queueStats, setQueueStats] = useState<QueueStats | null>(null);

  const [logs, setLogs] = useState<AdminLogItem[]>([]);
  const [totalLogs, setTotalLogs] = useState<number | null>(null);
  const [logPage, setLogPage] = useState(0);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');

  const logPageRef = useRef(0);
  logPageRef.current = logPage;
  const pageSize = 15;

  const getHeaders = useCallback((): Record<string, string> => {
    const token = localStorage.getItem('lumina_session_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  const fetchHealthCheck = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/health-check', { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        setHealthCheck(data);
        setHealthCheckError(null);
      } else {
        const errData = await res.json().catch(() => ({}));
        setHealthCheck(null);
        setHealthCheckError(errData?.error || `HTTP ${res.status}`);
      }
    } catch (err: any) {
      setHealthCheck(null);
      setHealthCheckError(err?.message || 'Network error');
    }
  }, [getHeaders]);

  const fetchSystemHealth = useCallback(async () => {
    setPingingFirestore(true);
    try {
      const res = await fetch('/api/admin/system-health', { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        setSystemHealth(data);
        setSystemHealthError(null);
      } else {
        const errData = await res.json().catch(() => ({}));
        setSystemHealth(null);
        setSystemHealthError(errData?.error || `HTTP ${res.status}`);
      }
    } catch (err: any) {
      setSystemHealth(null);
      setSystemHealthError(err?.message || 'Network error');
    } finally {
      setPingingFirestore(false);
    }
  }, [getHeaders]);

  const fetchCatalogAndVersion = useCallback(async () => {
    await Promise.all([
      (async () => {
        try {
          const res = await fetch('/api/version', { cache: 'no-store' });
          if (res.ok) {
            setVersionInfo(await res.json());
            setVersionError(null);
          } else {
            setVersionInfo(null);
            setVersionError(`HTTP ${res.status}`);
          }
        } catch (err: any) {
          setVersionInfo(null);
          setVersionError(err?.message || 'Network error');
        }
      })(),
      (async () => {
        try {
          const res = await fetch('/api/banners', { cache: 'no-store' });
          if (res.ok) {
            const data = await res.json();
            setBanners(Array.isArray(data?.banners) ? data.banners : []);
            setBannersError(null);
          } else {
            setBanners(null);
            setBannersError(`HTTP ${res.status}`);
          }
        } catch (err: any) {
          setBanners(null);
          setBannersError(err?.message || 'Network error');
        }
      })(),
      (async () => {
        try {
          const res = await fetch('/api/admin/templates', { headers: getHeaders() });
          if (res.ok) {
            const data = await res.json();
            setAdminTemplates(Array.isArray(data?.templates) ? data.templates : []);
            setAdminTemplatesError(null);
          } else {
            const errData = await res.json().catch(() => ({}));
            setAdminTemplates(null);
            setAdminTemplatesError(errData?.error || `HTTP ${res.status}`);
          }
        } catch (err: any) {
          setAdminTemplates(null);
          setAdminTemplatesError(err?.message || 'Network error');
        }
      })()
    ]);
  }, [getHeaders]);

  const fetchDiagnosticsSummary = useCallback(async () => {
    await Promise.all([
      (async () => {
        try {
          const res = await fetch('/api/admin/diagnostics/history', { headers: getHeaders() });
          if (res.ok) {
            const data = await res.json();
            setDiagHistory(Array.isArray(data?.history) ? data.history : []);
            setDiagHistorySource(data?.source || 'UNAVAILABLE');
            setDiagHistoryWarning(data?.warning || null);
            setDiagHistoryError(null);
          } else {
            const errData = await res.json().catch(() => ({}));
            setDiagHistory(null);
            setDiagHistorySource('UNAVAILABLE');
            setDiagHistoryError(errData?.error || `HTTP ${res.status}`);
          }
        } catch (err: any) {
          setDiagHistory(null);
          setDiagHistorySource('UNAVAILABLE');
          setDiagHistoryError(err?.message || 'Network error');
        }
      })(),
      (async () => {
        try {
          const res = await fetch('/api/admin/monitoring/alerts', { headers: getHeaders() });
          if (res.ok) {
            const data = await res.json();
            const rawAlerts = data?.alerts;
            if (Array.isArray(rawAlerts)) {
              setAlerts(rawAlerts);
            } else if (rawAlerts && Array.isArray(rawAlerts.active)) {
              setAlerts(rawAlerts.active);
            } else {
              setAlerts([]);
            }
            setAlertsError(null);
          } else {
            const errData = await res.json().catch(() => ({}));
            setAlerts(null);
            setAlertsError(errData?.error || `HTTP ${res.status}`);
          }
        } catch (err: any) {
          setAlerts(null);
          setAlertsError(err?.message || 'Network error');
        }
      })()
    ]);
  }, [getHeaders]);

  const fetchLogs = useCallback(async (page: number) => {
    setLogsLoading(true);
    try {
      const offset = page * pageSize;
      const res = await fetch(`/api/admin/logs?limit=${pageSize}&offset=${offset}`, { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        setLogs(Array.isArray(data.logs) ? data.logs : []);
        setTotalLogs(typeof data.total === 'number' ? data.total : 0);
        setLogsError(null);
      } else {
        const errData = await res.json().catch(() => ({}));
        setLogs([]);
        setTotalLogs(null);
        setLogsError(errData?.error || `HTTP ${res.status}`);
      }
    } catch (err: any) {
      setLogs([]);
      setTotalLogs(null);
      setLogsError(err?.message || 'Network error');
    } finally {
      setLogsLoading(false);
    }
  }, [getHeaders]);

  const loadClientMediaStats = useCallback(async () => {
    try {
      setQueueStats(getQueueStats());
      const stats = await mediaCacheStorage.getStats();
      setCacheStats(stats);
    } catch {
      setCacheStats(null);
      setQueueStats(null);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([
      fetchHealthCheck(),
      fetchSystemHealth(),
      fetchCatalogAndVersion(),
      fetchDiagnosticsSummary(),
      fetchLogs(logPageRef.current),
      loadClientMediaStats()
    ]);
    setLoading(false);
  }, [
    fetchHealthCheck,
    fetchSystemHealth,
    fetchCatalogAndVersion,
    fetchDiagnosticsSummary,
    fetchLogs,
    loadClientMediaStats
  ]);

  useEffect(() => {
    if (isOpen) {
      refreshAll();
    }
  }, [isOpen, refreshAll]);

  // Derived genuine values (NO hardcoded HEALTHY, VERIFIED, 5, or c2f21a6)
  const clientProjectId = healthCheck?.clientFirebase?.projectId || (firebaseConfig as any).projectId || 'UNAVAILABLE';
  const clientDatabaseId =
    healthCheck?.clientFirebase?.firestoreDatabaseId ||
    (firebaseConfig as any).firestoreDatabaseId ||
    '(default)';
  const backendProjectId = healthCheck
    ? healthCheck.adminSdk.initialized
      ? healthCheck.adminSdk.projectId || 'UNAVAILABLE'
      : 'NOT_CONNECTED'
    : 'NOT_VERIFIED';
  const backendDatabaseId = healthCheck
    ? healthCheck.adminSdk.initialized
      ? healthCheck.adminSdk.databaseId || healthCheck.databaseId || '(default)'
      : 'NOT_CONNECTED'
    : 'NOT_VERIFIED';

  const projectParityStatus = !healthCheck
    ? 'NOT_VERIFIED'
    : !healthCheck.adminSdk.initialized
    ? 'DISCONNECTED'
    : clientProjectId === backendProjectId
    ? 'MATCH'
    : 'MISMATCH';

  const databaseParityStatus = !healthCheck
    ? 'NOT_VERIFIED'
    : !healthCheck.adminSdk.initialized
    ? 'DISCONNECTED'
    : clientDatabaseId === backendDatabaseId
    ? 'MATCH'
    : 'MISMATCH';

  const commitShaValue = healthCheck?.gitCommitSha || versionInfo?.commitSha || 'UNAVAILABLE';
  const cloudRunRevValue = healthCheck?.cloudRunRevision || versionInfo?.cloudRunRevision || 'UNAVAILABLE';
  const appEnvValue = healthCheck?.environment || 'UNAVAILABLE';
  const appVersionValue = healthCheck?.appVersion || 'UNAVAILABLE';
  const buildTimeValue = versionInfo?.buildTime || healthCheck?.startupTime || 'UNAVAILABLE';

  const activeBannersCount = banners !== null ? banners.filter((b) => b?.isActive !== false).length : null;
  const totalBannersCount = banners !== null ? banners.length : null;
  const adminActiveTemplatesCount = adminTemplates !== null ? adminTemplates.filter((t) => t?.isActive !== false).length : null;
  const adminInactiveTemplatesCount = adminTemplates !== null ? adminTemplates.filter((t) => t?.isActive === false).length : null;
  const latestDiagRun = diagHistory && diagHistory.length > 0 ? diagHistory[0] : null;
  const activeAlertsList = alerts ? alerts.filter((a) => !a.resolved) : null;

  // Compute genuine unresolved warnings & mismatches
  const warningsAndMismatches: string[] = [];
  if (healthCheckError) warningsAndMismatches.push(`Health Check Endpoint Failed: ${healthCheckError}`);
  if (systemHealthError) warningsAndMismatches.push(`System Health Endpoint Failed: ${systemHealthError}`);
  if (versionError) warningsAndMismatches.push(`Version Endpoint Failed: ${versionError}`);
  if (bannersError) warningsAndMismatches.push(`Banners Endpoint Failed: ${bannersError}`);
  if (adminTemplatesError) warningsAndMismatches.push(`Admin Templates Endpoint Failed: ${adminTemplatesError}`);
  if (diagHistoryError) warningsAndMismatches.push(`Diagnostics History Endpoint Failed: ${diagHistoryError}`);
  if (logsError) warningsAndMismatches.push(`Admin Logs Endpoint Failed: ${logsError}`);
  if (projectParityStatus === 'MISMATCH') {
    warningsAndMismatches.push(`Firebase Project ID Mismatch: Client=${clientProjectId} vs Backend=${backendProjectId}`);
  }
  if (databaseParityStatus === 'MISMATCH') {
    warningsAndMismatches.push(`Firestore Database ID Mismatch: Client=${clientDatabaseId} vs Backend=${backendDatabaseId}`);
  }
  if (healthCheck && !healthCheck.adminSdk.initialized) {
    warningsAndMismatches.push('Firebase Admin SDK is NOT initialized on backend.');
  }
  if (commitShaValue === 'UNVERIFIED/BLOCKED' || commitShaValue === 'UNAVAILABLE' || commitShaValue === 'UNKNOWN') {
    warningsAndMismatches.push(`Git Commit SHA unavailable in runtime (${commitShaValue}).`);
  }
  if (healthCheck && !healthCheck.storage.r2Configured) {
    const missing = healthCheck.storage.missingEnvVars?.length
      ? ` (missing: ${healthCheck.storage.missingEnvVars.join(', ')})`
      : '';
    warningsAndMismatches.push(`Cloudflare R2 not configured${missing}; active driver=${healthCheck.storage.driver}.`);
  }
  if (systemHealth && systemHealth.recentErrorsCount > 0) {
    warningsAndMismatches.push(
      `${systemHealth.recentErrorsCount} API 4xx/5xx error(s) recorded in last ${systemHealth.recentErrorsWindowMinutes ?? 15} minutes.`
    );
  }
  if (latestDiagRun && (latestDiagRun.stats.failed > 0 || latestDiagRun.stats.blocked > 0)) {
    warningsAndMismatches.push(
      `Latest diagnostic run (${latestDiagRun.runId}) reported ${latestDiagRun.stats.failed} FAILED and ${latestDiagRun.stats.blocked} BLOCKED probes.`
    );
  }
  if (activeAlertsList && activeAlertsList.length > 0) {
    warningsAndMismatches.push(`${activeAlertsList.length} unresolved Cloud Monitoring alert(s) active.`);
  }

  // Generate 1-Click Complete Sanitized Diagnostic Report (Markdown + Structured JSON)
  const handleCopyReport = async () => {
    const now = new Date().toISOString();
    const activeActor = user?.email || healthCheck?.actorEmail || 'NOT_VERIFIED';

    const sanitizedPayload = {
      reportSchemaVersion: '1.0-lite',
      generatedAt: now,
      applicationAndBuild: {
        environment: appEnvValue,
        appVersion: appVersionValue,
        gitCommitSha: commitShaValue,
        gitBranch: 'UNAVAILABLE (no .git metadata in runtime)',
        cloudRunRevision: cloudRunRevValue,
        buildTimestamp: buildTimeValue,
        uptimeSeconds: systemHealth ? systemHealth.uptimeSeconds : 'UNAVAILABLE'
      },
      firebaseAndAuth: {
        clientProjectId,
        clientDatabaseId,
        clientAuthDomain: healthCheck?.clientFirebase?.authDomain || (firebaseConfig as any).authDomain || 'UNAVAILABLE',
        adminSdkInitialized: healthCheck ? healthCheck.adminSdk.initialized : 'NOT_VERIFIED',
        adminSdkProjectId: backendProjectId,
        adminSdkDatabaseId: backendDatabaseId,
        projectParity: projectParityStatus,
        databaseParity: databaseParityStatus,
        firestoreMode: healthCheck?.firestoreMode || 'NOT_VERIFIED',
        sessionPersistence: healthCheck?.sessionPersistence || 'NOT_VERIFIED',
        actorEmail: activeActor,
        authorizedAdminEmails: AUTHORIZED_ADMIN_EMAILS
      },
      catalogue: {
        catalogueStatus: versionInfo?.catalogueStatus || 'UNAVAILABLE',
        catalogRevision: versionInfo?.catalogRevision ?? 'UNAVAILABLE',
        publicActiveTemplatesCount: templates.length,
        adminTotalTemplatesCount: adminTemplates !== null ? adminTemplates.length : 'UNAVAILABLE',
        adminActiveTemplatesCount: adminActiveTemplatesCount ?? 'UNAVAILABLE',
        adminInactiveTemplatesCount: adminInactiveTemplatesCount ?? 'UNAVAILABLE',
        activeHeroBannersCount: activeBannersCount ?? 'UNAVAILABLE',
        totalHeroBannersCount: totalBannersCount ?? 'UNAVAILABLE',
        faceswapSceneCount: versionInfo?.faceswapSceneCount ?? 'UNAVAILABLE'
      },
      diagnostics: latestDiagRun
        ? {
            status: 'AVAILABLE',
            source: diagHistorySource,
            runId: latestDiagRun.runId,
            timestamp: latestDiagRun.timestamp,
            overallStatus: latestDiagRun.overallStatus,
            stats: latestDiagRun.stats,
            probes: latestDiagRun.results.map((r) => ({
              id: r.id,
              name: r.name,
              category: r.category,
              status: r.status,
              testType: r.testType || 'LIVE_PROBE',
              durationMs: r.durationMs,
              endpointOrProvider: r.endpointOrProvider,
              failureReason: r.failureReason || null
            }))
          }
        : {
            status: diagHistoryError ? 'UNAVAILABLE' : 'NOT_TESTED',
            error: diagHistoryError || null,
            note: 'No diagnostic run found in history.'
          },
      storageAndMediaCache: {
        storageDriver: healthCheck?.storage?.driver || systemHealth?.storage?.driver || 'UNAVAILABLE',
        r2Configured: healthCheck ? healthCheck.storage.r2Configured : 'NOT_VERIFIED',
        r2Bucket: healthCheck?.storage?.bucket || systemHealth?.storage?.bucket || 'UNAVAILABLE',
        r2StorageUsageAndObjectCount: 'UNAVAILABLE (Not instrumented in current dashboard)',
        clientMediaCache: cacheStats
          ? {
              storedMb: Number((cacheStats.totalBytesStored / (1024 * 1024)).toFixed(2)),
              cachedItemCount: cacheStats.itemCount,
              hitCount: cacheStats.hitCount,
              missCount: cacheStats.missCount,
              evictionCount: cacheStats.evictionCount,
              inMemoryQueueCacheSize: queueStats?.cacheSize ?? 'UNAVAILABLE',
              pendingDownloads: queueStats?.pendingCount ?? 'UNAVAILABLE',
              activeDownloads: queueStats?.activeCount ?? 'UNAVAILABLE',
              isDataSaver: queueStats?.isDataSaver ?? 'UNAVAILABLE'
            }
          : 'UNAVAILABLE'
      },
      backendApiAndHealth: {
        serverStatus: systemHealth?.status || (systemHealthError ? 'ERROR' : 'NOT_VERIFIED'),
        firestoreStatus: systemHealth?.firestore?.status || 'NOT_VERIFIED',
        firestoreLatencyMs:
          systemHealth && systemHealth.firestore.latencyMs >= 0 ? systemHealth.firestore.latencyMs : 'UNAVAILABLE',
        memoryRssMb: systemHealth?.memory?.rssMb ?? 'UNAVAILABLE',
        memoryHeapUsedMb: systemHealth?.memory?.heapUsedMb ?? 'UNAVAILABLE',
        memoryHeapTotalMb: systemHealth?.memory?.heapTotalMb ?? 'UNAVAILABLE',
        recentErrorsCount: systemHealth ? systemHealth.recentErrorsCount : 'UNAVAILABLE',
        recentErrorsWindowMinutes: systemHealth?.recentErrorsWindowMinutes ?? 'UNAVAILABLE',
        recentApiErrors: systemHealth?.recentApiErrors || [],
        activeMonitoringAlertsCount: activeAlertsList ? activeAlertsList.length : 'UNAVAILABLE'
      },
      recentAdminLogs: {
        totalLogs: totalLogs ?? 'UNAVAILABLE',
        shownCount: logs.length,
        entries: logs.map((l) => ({
          timestamp: l.timestamp,
          actorEmail: l.actorEmail,
          action: l.action,
          targetId: l.targetId,
          details: l.details
        }))
      },
      warningsAndMismatches: warningsAndMismatches.length > 0 ? warningsAndMismatches : ['None detected in current checks']
    };

    const reportMarkdown = `# AI PRIME STUDIO — SANITIZED DIAGNOSTIC REPORT
Generated At: ${now}
Actor Email: ${activeActor}

## 1. APPLICATION & BUILD
- Environment: ${appEnvValue}
- App Version: ${appVersionValue}
- Git Commit SHA: ${commitShaValue}
- Git Branch: UNAVAILABLE (no .git metadata in runtime)
- Cloud Run Revision: ${cloudRunRevValue}
- Build / Startup Time: ${buildTimeValue}
- Server Uptime: ${systemHealth ? `${Math.floor(systemHealth.uptimeSeconds / 60)} min (${systemHealth.uptimeSeconds}s)` : 'UNAVAILABLE'}

## 2. FIREBASE & AUTHENTICATION
- Client Project ID: ${clientProjectId}
- Client Database ID: ${clientDatabaseId}
- Admin SDK Initialized: ${healthCheck ? String(healthCheck.adminSdk.initialized) : 'NOT_VERIFIED'}
- Backend Admin SDK Project ID: ${backendProjectId}
- Backend Admin SDK Database ID: ${backendDatabaseId}
- Project Parity: ${projectParityStatus}
- Database Parity: ${databaseParityStatus}
- Firestore Mode: ${healthCheck?.firestoreMode || 'NOT_VERIFIED'}
- Session Persistence: ${healthCheck?.sessionPersistence || 'NOT_VERIFIED'}
- Authorized Admin Allowlist: ${AUTHORIZED_ADMIN_EMAILS.join(', ')}

## 3. TEMPLATES & HERO BANNERS
- Catalogue Status: ${versionInfo?.catalogueStatus || 'UNAVAILABLE'} (Rev: ${versionInfo?.catalogRevision ?? 'UNAVAILABLE'})
- Public Active Templates: ${templates.length}
- Admin Total Templates: ${adminTemplates !== null ? adminTemplates.length : 'UNAVAILABLE'} (Active: ${adminActiveTemplatesCount ?? 'UNAVAILABLE'}, Inactive: ${adminInactiveTemplatesCount ?? 'UNAVAILABLE'})
- Active Hero Banners: ${activeBannersCount ?? 'UNAVAILABLE'} (Total: ${totalBannersCount ?? 'UNAVAILABLE'})
- FaceSwap Scenes: ${versionInfo?.faceswapSceneCount ?? 'UNAVAILABLE'}

## 4. EXISTING DIAGNOSTICS SUMMARY
${
  latestDiagRun
    ? `- Run ID: ${latestDiagRun.runId} (${latestDiagRun.timestamp})
- Source: ${diagHistorySource}
- Overall Status: ${latestDiagRun.overallStatus}
- Counts: ${latestDiagRun.stats.passed} PASS, ${latestDiagRun.stats.failed} FAIL, ${latestDiagRun.stats.blocked} BLOCKED, ${latestDiagRun.stats.warning} WARNING
${latestDiagRun.results.map((r) => `  - [${r.status.toUpperCase()}] ${r.name} (${r.testType || 'LIVE_PROBE'}, ${r.durationMs}ms)${r.failureReason ? ` — Reason: ${r.failureReason}` : ''}`).join('\n')}`
    : `- Status: ${diagHistoryError ? `UNAVAILABLE (${diagHistoryError})` : 'NOT_TESTED (No diagnostic run recorded yet)'}`
}

## 5. STORAGE & CLIENT MEDIA CACHE
- Storage Driver: ${healthCheck?.storage?.driver || systemHealth?.storage?.driver || 'UNAVAILABLE'}
- R2 Configured: ${healthCheck ? String(healthCheck.storage.r2Configured) : 'NOT_VERIFIED'}
- R2 Bucket: ${healthCheck?.storage?.bucket || systemHealth?.storage?.bucket || 'UNAVAILABLE'}
- R2 Usage / Object Count: UNAVAILABLE (Not instrumented)
- Client IndexedDB Cache: ${
      cacheStats
        ? `${(cacheStats.totalBytesStored / (1024 * 1024)).toFixed(2)} MB (${cacheStats.itemCount} items, ${cacheStats.hitCount} hits / ${cacheStats.missCount} misses, ${cacheStats.evictionCount} evictions, pending=${queueStats?.pendingCount ?? 'UNAVAILABLE'}, active=${queueStats?.activeCount ?? 'UNAVAILABLE'}, dataSaver=${queueStats?.isDataSaver ? 'ON' : 'OFF'})`
        : 'UNAVAILABLE'
    }

## 6. BACKEND HEALTH, LATENCY & API ERRORS
- Server Status: ${systemHealth?.status || (systemHealthError ? `ERROR (${systemHealthError})` : 'NOT_VERIFIED')}
- Firestore Health: ${systemHealth?.firestore?.status || 'NOT_VERIFIED'}
- Firestore Latency: ${systemHealth && systemHealth.firestore.latencyMs >= 0 ? `${systemHealth.firestore.latencyMs} ms` : 'UNAVAILABLE'}
- Container Memory: ${systemHealth ? `${systemHealth.memory.rssMb} MB RSS (Heap ${systemHealth.memory.heapUsedMb}/${systemHealth.memory.heapTotalMb} MB)` : 'UNAVAILABLE'}
- Recent API 4xx/5xx Errors (${systemHealth?.recentErrorsWindowMinutes ?? 15}m window): ${systemHealth ? systemHealth.recentErrorsCount : 'UNAVAILABLE'}
${
  systemHealth?.recentApiErrors && systemHealth.recentApiErrors.length > 0
    ? systemHealth.recentApiErrors.map((e) => `  - [${e.timestamp}] ${e.method} ${e.path} -> HTTP ${e.status}`).join('\n')
    : '  - No 4xx/5xx entries in window (or unavailable)'
}
- Active Monitoring Alerts: ${activeAlertsList ? activeAlertsList.length : 'UNAVAILABLE'}

## 7. RECENT ADMIN ACTIVITY LOGS (${logs.length} of ${totalLogs ?? 'UNAVAILABLE'})
${
  logs.length > 0
    ? logs.map((l) => `- [${l.timestamp.slice(0, 19).replace('T', ' ')}] ${l.action} by ${l.actorEmail} (${l.targetId}): ${l.details}`).join('\n')
    : logsError
    ? `- UNAVAILABLE (${logsError})`
    : '- No admin activity logs recorded yet.'
}

## 8. KNOWN WARNINGS & UNRESOLVED MISMATCHES
${warningsAndMismatches.length > 0 ? warningsAndMismatches.map((w) => `- ${w}`).join('\n') : '- None detected.'}

## 9. STRUCTURED JSON DATA
\`\`\`json
${JSON.stringify(sanitizedPayload, null, 2)}
\`\`\`

Note: Strictly sanitized report. API keys, private keys, session tokens, signed URLs, and customer media are excluded.`.trim();

    let copied = false;
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(reportMarkdown);
        copied = true;
      }
    } catch {
      copied = false;
    }

    if (!copied) {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = reportMarkdown;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        copied = document.execCommand('copy');
        document.body.removeChild(textarea);
      } catch {
        copied = false;
      }
    }

    setCopyStatus(copied ? 'copied' : 'failed');
    setTimeout(() => setCopyStatus('idle'), 2800);
  };

  if (!isOpen) return null;

  const renderStatusLabel = (status: string) => {
    const map: Record<string, string> = {
      MATCH: 'text-emerald-400',
      VERIFIED: 'text-emerald-400',
      CONNECTED: 'text-emerald-400',
      FIRESTORE_SESSION_DURABLE: 'text-emerald-400',
      LIVE_CLOUD_FIRESTORE: 'text-emerald-400',
      HEALTHY: 'text-emerald-400',
      MISMATCH: 'text-rose-400',
      DISCONNECTED: 'text-rose-400',
      ERROR: 'text-rose-400',
      STANDBY_LOCAL: 'text-amber-300',
      LOCAL_FALLBACK_ONLY: 'text-amber-300',
      UNVERIFIED: 'text-amber-300',
      NOT_VERIFIED: 'text-stone-400',
      UNAVAILABLE: 'text-stone-400'
    };
    return map[status] || 'text-stone-300';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-5 bg-black/85 backdrop-blur-md overflow-hidden">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 10 }}
        transition={{ duration: 0.18 }}
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
                Actor: <span className="text-stone-200 font-medium">{user?.email || healthCheck?.actorEmail || 'NOT_VERIFIED'}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* 1-Click Copy Diagnostic Report */}
            <button
              type="button"
              onClick={handleCopyReport}
              className={`min-h-[40px] px-3.5 py-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                copyStatus === 'copied'
                  ? 'bg-emerald-500/20 border-emerald-400/60 text-emerald-300'
                  : copyStatus === 'failed'
                  ? 'bg-rose-500/20 border-rose-400/60 text-rose-300'
                  : 'bg-gradient-to-r from-amber-500/20 to-orange-500/20 border-amber-500/45 hover:border-amber-400 text-amber-200'
              }`}
              title="Copy complete sanitized Markdown & JSON diagnostic report"
            >
              {copyStatus === 'copied' ? (
                <>
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span>Report Copied!</span>
                </>
              ) : copyStatus === 'failed' ? (
                <>
                  <AlertTriangle className="w-4 h-4 text-rose-400" />
                  <span>Copy Blocked</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-amber-300" />
                  <span>Copy Diagnostic Report</span>
                </>
              )}
            </button>

            {/* Refresh Button */}
            <button
              type="button"
              onClick={refreshAll}
              disabled={loading}
              aria-label="Refresh Dashboard Data"
              className="min-h-[40px] min-w-[40px] p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-stone-300 hover:text-white transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center"
              title="Refresh Dashboard Data"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-[#ff9f00]' : ''}`} />
            </button>

            {/* Root Close Button */}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Admin Dashboard"
              className="min-h-[40px] min-w-[40px] p-2 rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 text-stone-300 hover:text-white transition-colors cursor-pointer flex items-center justify-center"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Five Colour-Coded Navigation Tabs */}
        <div
          role="tablist"
          aria-label="Admin Dashboard Sections"
          className="px-3 sm:px-4 pt-2.5 border-b border-white/10 bg-[#08080c] flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'gallery'}
            onClick={() => setActiveTab('gallery')}
            className={`min-h-[44px] px-3.5 py-2 rounded-t-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap shrink-0 border-x border-t-2 ${
              activeTab === 'gallery'
                ? 'bg-[#181410] text-[#ff9f00] border-t-[#ff9f00] border-x-[#ff9f00]/30 shadow-inner'
                : 'text-stone-300 bg-white/[0.03] hover:bg-white/[0.07] hover:text-white border-transparent'
            }`}
          >
            <Grid className={`w-4 h-4 ${activeTab === 'gallery' ? 'text-[#ff9f00]' : 'text-[#ff9f00]/75'}`} />
            <span>Admin Gallery & Templates</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'diagnostics'}
            onClick={() => setActiveTab('diagnostics')}
            className={`min-h-[44px] px-3.5 py-2 rounded-t-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap shrink-0 border-x border-t-2 ${
              activeTab === 'diagnostics'
                ? 'bg-[#0d1914] text-emerald-400 border-t-emerald-400 border-x-emerald-500/30 shadow-inner'
                : 'text-stone-300 bg-white/[0.03] hover:bg-white/[0.07] hover:text-white border-transparent'
            }`}
          >
            <Cpu className={`w-4 h-4 ${activeTab === 'diagnostics' ? 'text-emerald-400' : 'text-emerald-400/75'}`} />
            <span>System Diagnostics</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'health_check'}
            onClick={() => setActiveTab('health_check')}
            className={`min-h-[44px] px-3.5 py-2 rounded-t-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap shrink-0 border-x border-t-2 ${
              activeTab === 'health_check'
                ? 'bg-[#19160d] text-amber-300 border-t-amber-300 border-x-amber-400/30 shadow-inner'
                : 'text-stone-300 bg-white/[0.03] hover:bg-white/[0.07] hover:text-white border-transparent'
            }`}
          >
            <Shield className={`w-4 h-4 ${activeTab === 'health_check' ? 'text-amber-300' : 'text-amber-300/75'}`} />
            <span>Admin Health Check</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'system_health'}
            onClick={() => setActiveTab('system_health')}
            className={`min-h-[44px] px-3.5 py-2 rounded-t-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap shrink-0 border-x border-t-2 ${
              activeTab === 'system_health'
                ? 'bg-[#0d161e] text-sky-400 border-t-sky-400 border-x-sky-500/30 shadow-inner'
                : 'text-stone-300 bg-white/[0.03] hover:bg-white/[0.07] hover:text-white border-transparent'
            }`}
          >
            <Activity className={`w-4 h-4 ${activeTab === 'system_health' ? 'text-sky-400' : 'text-sky-400/75'}`} />
            <span>System Health & Metrics</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'logs'}
            onClick={() => setActiveTab('logs')}
            className={`min-h-[44px] px-3.5 py-2 rounded-t-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap shrink-0 border-x border-t-2 ${
              activeTab === 'logs'
                ? 'bg-[#16101e] text-purple-400 border-t-purple-400 border-x-purple-500/30 shadow-inner'
                : 'text-stone-300 bg-white/[0.03] hover:bg-white/[0.07] hover:text-white border-transparent'
            }`}
          >
            <ScrollText className={`w-4 h-4 ${activeTab === 'logs' ? 'text-purple-400' : 'text-purple-400/75'}`} />
            <span>Admin Activity Logs</span>
          </button>
        </div>

        {/* Tab Body Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {/* TAB 1: Admin Gallery & Templates */}
          {activeTab === 'gallery' && (
            <div className="space-y-5">
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
                    onClick={fetchCatalogAndVersion}
                    disabled={loading}
                    className="min-h-[40px] px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-stone-200 font-semibold text-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                    <span>Refresh Counts</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      setTemplateManagerOpen(true);
                    }}
                    className="min-h-[40px] px-4 py-2 rounded-xl bg-gradient-to-r from-[#ff9f00] to-[#ea580c] text-black font-bold text-xs flex items-center gap-2 shadow-lg cursor-pointer hover:brightness-105"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Open Full Template Manager</span>
                  </button>
                </div>
              </div>

              {(adminTemplatesError || bannersError || versionError) && (
                <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-500/40 text-amber-200 text-xs flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    {adminTemplatesError && <div>Admin Templates Error: {adminTemplatesError}</div>}
                    {bannersError && <div>Banners API Error: {bannersError}</div>}
                    {versionError && <div>Version API Error: {versionError}</div>}
                  </div>
                </div>
              )}

              {/* Genuine Catalog Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-4 rounded-xl bg-white/[0.04] border border-white/10">
                  <span className="text-[11px] text-stone-400 block">Admin Templates</span>
                  <span className="text-2xl font-bold font-mono tabular-nums text-white mt-1 block">
                    {loading && adminTemplates === null ? '...' : adminTemplates !== null ? adminTemplates.length : 'UNAVAILABLE'}
                  </span>
                  <span className="text-[11px] text-stone-400 font-mono tabular-nums mt-1 block">
                    {adminTemplates !== null
                      ? `Active ${adminActiveTemplatesCount} · Inactive ${adminInactiveTemplatesCount} · Public ${templates.length}`
                      : `Public UI: ${templates.length}`}
                  </span>
                </div>

                <div className="p-4 rounded-xl bg-white/[0.04] border border-white/10">
                  <span className="text-[11px] text-stone-400 block">Active Hero Banners</span>
                  <span className="text-2xl font-bold font-mono tabular-nums text-[#ff9f00] mt-1 block">
                    {loading && activeBannersCount === null ? '...' : activeBannersCount !== null ? activeBannersCount : 'UNAVAILABLE'}
                  </span>
                  <span className="text-[11px] text-stone-400 font-mono tabular-nums mt-1 block">
                    {totalBannersCount !== null ? `Persisted Total: ${totalBannersCount}` : 'Source: /api/banners'}
                  </span>
                </div>

                <div className="p-4 rounded-xl bg-white/[0.04] border border-white/10">
                  <span className="text-[11px] text-stone-400 block">Storage Driver</span>
                  <span
                    className={`text-sm font-bold mt-2 block truncate ${
                      healthCheck
                        ? healthCheck.storage.r2Configured
                          ? 'text-emerald-400'
                          : 'text-amber-300'
                        : 'text-stone-400'
                    }`}
                  >
                    {loading && !healthCheck
                      ? 'Checking...'
                      : healthCheck
                      ? healthCheck.storage.r2Configured
                        ? 'Cloudflare R2'
                        : healthCheck.storage.driver
                      : 'NOT_VERIFIED'}
                  </span>
                  <span className="text-[11px] text-stone-400 font-mono truncate block mt-1">
                    {healthCheck?.storage?.bucket || 'Bucket: UNAVAILABLE'}
                  </span>
                </div>

                <div className="p-4 rounded-xl bg-white/[0.04] border border-white/10">
                  <span className="text-[11px] text-stone-400 block">Catalog Status</span>
                  <span className="text-sm font-bold font-mono text-stone-200 mt-2 block">
                    {loading && !versionInfo ? 'Checking...' : versionInfo?.catalogueStatus || 'UNAVAILABLE'}
                  </span>
                  <span className="text-[11px] text-stone-400 font-mono tabular-nums block mt-1">
                    {versionInfo ? `Rev ${versionInfo.catalogRevision} · ${versionInfo.databaseMode}` : 'Source: /api/version'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: System Diagnostics */}
          {activeTab === 'diagnostics' && (
            <div className="space-y-5">
              <div className="p-5 rounded-2xl bg-gradient-to-br from-[#0e1a14] to-[#0c1210] border border-emerald-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h4 className="text-base font-bold text-white flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-emerald-400" />
                    <span>Automated Diagnostic Suite & Live Probes</span>
                  </h4>
                  <p className="text-xs text-stone-300 mt-1 max-w-xl">
                    Run the existing 14 verification probes across Firebase, Google Cloud, Razorpay, Cloudflare R2, and AI adapters.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={fetchDiagnosticsSummary}
                    disabled={loading}
                    className="min-h-[40px] px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-stone-200 font-semibold text-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                    <span>Refresh Latest Run</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      setDiagnosticsModalOpen(true);
                    }}
                    className="min-h-[40px] px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-black font-bold text-xs flex items-center gap-2 shadow-lg cursor-pointer hover:brightness-105"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Launch Diagnostics Modal</span>
                  </button>
                </div>
              </div>

              {diagHistoryError && (
                <div className="p-3 rounded-xl bg-rose-950/30 border border-rose-500/40 text-rose-200 text-xs flex items-center gap-2">
                  <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>Failed to fetch diagnostic run history: {diagHistoryError}</span>
                </div>
              )}

              {diagHistoryWarning && (
                <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-500/40 text-amber-200 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>{diagHistoryWarning}</span>
                </div>
              )}

              {/* Genuine Latest Recorded Run Summary */}
              {latestDiagRun ? (
                <div className="p-4 rounded-2xl bg-black/40 border border-white/10 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      {latestDiagRun.overallStatus === 'HEALTHY' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-amber-400" />
                      )}
                      <span className="font-bold text-white font-mono">{latestDiagRun.runId}</span>
                      <span className="text-stone-400">·</span>
                      <span className="font-mono text-stone-300">{latestDiagRun.overallStatus}</span>
                    </div>
                    <span className="text-[11px] font-mono text-stone-400 tabular-nums">
                      {new Date(latestDiagRun.timestamp).toLocaleString()} ({diagHistorySource})
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono tabular-nums">
                    <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300">
                      Passed: {latestDiagRun.stats.passed}
                    </div>
                    <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300">
                      Failed: {latestDiagRun.stats.failed}
                    </div>
                    <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300">
                      Blocked: {latestDiagRun.stats.blocked}
                    </div>
                    <div className="p-2.5 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-yellow-300">
                      Warning: {latestDiagRun.stats.warning}
                    </div>
                  </div>

                  <div className="divide-y divide-white/5 rounded-xl border border-white/10 bg-black/30 max-h-60 overflow-y-auto">
                    {latestDiagRun.results.map((probe) => (
                      <div key={probe.id} className="px-3 py-2 flex items-center justify-between gap-3 text-xs">
                        <div className="min-w-0">
                          <div className="text-stone-200 font-medium truncate">{probe.name}</div>
                          <div className="text-[11px] text-stone-500 font-mono truncate">
                            {probe.endpointOrProvider} · {probe.durationMs}ms
                          </div>
                        </div>
                        <span
                          className={`font-mono text-[11px] font-bold shrink-0 ${
                            probe.status === 'passed'
                              ? 'text-emerald-400'
                              : probe.status === 'failed'
                              ? 'text-rose-400'
                              : 'text-amber-300'
                          }`}
                        >
                          {probe.status.toUpperCase()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-5 rounded-2xl bg-black/40 border border-white/10 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-stone-300 uppercase tracking-wider">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    <span>Diagnostic Run Status: {loading ? 'LOADING...' : diagHistoryError ? 'UNAVAILABLE' : 'NOT_TESTED'}</span>
                  </div>
                  <p className="text-xs text-stone-400 leading-relaxed">
                    {diagHistoryError
                      ? 'Could not retrieve past diagnostic runs from the server.'
                      : 'No recent diagnostic run is recorded in history yet. Click "Launch Diagnostics Modal" above to run the 14 existing verification probes.'}
                  </p>
                </div>
              )}

              <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs text-stone-300">
                <span>
                  Authorized Admin Accounts:{' '}
                  <code className="text-amber-300">{AUTHORIZED_ADMIN_EMAILS.join(', ')}</code>
                </span>
                <span className="font-mono tabular-nums text-stone-400">
                  Monitoring Alerts:{' '}
                  {alertsError
                    ? 'UNAVAILABLE'
                    : activeAlertsList !== null
                    ? `${activeAlertsList.length} Active`
                    : 'Loading...'}
                </span>
              </div>
            </div>
          )}

          {/* TAB 3: Admin Health Check Table */}
          {activeTab === 'health_check' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <Shield className="w-4 h-4 text-amber-300" />
                  <span>Authoritative Project & Session Configuration</span>
                </h4>
                <span className="text-[11px] text-stone-400 font-mono tabular-nums">
                  Checked:{' '}
                  {healthCheck
                    ? new Date(healthCheck.timestamp).toLocaleTimeString()
                    : healthCheckError
                    ? 'FAILED'
                    : 'Loading...'}
                </span>
              </div>

              {healthCheckError && (
                <div className="p-3 rounded-xl bg-rose-950/30 border border-rose-500/40 text-rose-200 text-xs flex items-center gap-2">
                  <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>Admin Health Check API Error: {healthCheckError}</span>
                </div>
              )}

              {(projectParityStatus === 'MISMATCH' || databaseParityStatus === 'MISMATCH') && (
                <div className="p-3.5 rounded-xl bg-rose-950/30 border border-rose-500/40 text-rose-200 text-xs flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-rose-300">Configuration Mismatch Detected</div>
                    {projectParityStatus === 'MISMATCH' && (
                      <div>
                        Client Project (<code>{clientProjectId}</code>) differs from Backend Admin SDK (<code>{backendProjectId}</code>).
                      </div>
                    )}
                    {databaseParityStatus === 'MISMATCH' && (
                      <div>
                        Client Database ID (<code>{clientDatabaseId}</code>) differs from Backend Database ID (<code>{backendDatabaseId}</code>).
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="rounded-2xl border border-white/10 overflow-x-auto bg-black/30">
                <table className="w-full text-left text-xs min-w-[560px]">
                  <thead className="bg-white/5 border-b border-white/10 text-stone-400 font-semibold uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="py-3 px-4">Component</th>
                      <th className="py-3 px-4">Client / Configured</th>
                      <th className="py-3 px-4">Backend Authoritative</th>
                      <th className="py-3 px-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-stone-300">
                    <tr>
                      <td className="py-3 px-4 font-semibold text-white">Firebase Project ID</td>
                      <td className="py-3 px-4 font-mono text-amber-200">{clientProjectId}</td>
                      <td className="py-3 px-4 font-mono text-stone-300">{backendProjectId}</td>
                      <td className={`py-3 px-4 font-mono font-bold text-[11px] ${renderStatusLabel(projectParityStatus)}`}>
                        {projectParityStatus}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-3 px-4 font-semibold text-white">Firestore Database ID</td>
                      <td className="py-3 px-4 font-mono text-amber-200">{clientDatabaseId}</td>
                      <td className="py-3 px-4 font-mono text-stone-300">{backendDatabaseId}</td>
                      <td className={`py-3 px-4 font-mono font-bold text-[11px] ${renderStatusLabel(databaseParityStatus)}`}>
                        {databaseParityStatus}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-3 px-4 font-semibold text-white">Firebase Admin SDK</td>
                      <td className="py-3 px-4 font-mono text-stone-300">{healthCheck?.firestoreMode || 'NOT_VERIFIED'}</td>
                      <td className="py-3 px-4 font-mono text-stone-300">
                        {healthCheck ? (healthCheck.adminSdk.initialized ? 'INITIALIZED' : 'NOT_INITIALIZED') : 'NOT_VERIFIED'}
                      </td>
                      <td
                        className={`py-3 px-4 font-mono font-bold text-[11px] ${renderStatusLabel(
                          !healthCheck ? 'NOT_VERIFIED' : healthCheck.adminSdk.initialized ? 'CONNECTED' : 'DISCONNECTED'
                        )}`}
                      >
                        {!healthCheck ? 'NOT_VERIFIED' : healthCheck.adminSdk.initialized ? 'CONNECTED' : 'DISCONNECTED'}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-3 px-4 font-semibold text-white">Session Persistence</td>
                      <td className="py-3 px-4 font-mono text-stone-300">Bearer Token Auth</td>
                      <td className="py-3 px-4 font-mono text-stone-300">{healthCheck?.sessionPersistence || 'NOT_VERIFIED'}</td>
                      <td
                        className={`py-3 px-4 font-mono font-bold text-[11px] ${renderStatusLabel(
                          healthCheck?.sessionPersistence || 'NOT_VERIFIED'
                        )}`}
                      >
                        {healthCheck?.sessionPersistence || 'NOT_VERIFIED'}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-3 px-4 font-semibold text-white">Storage / Cloudflare R2</td>
                      <td className="py-3 px-4 font-mono text-stone-300">{healthCheck?.storage?.driver || 'NOT_VERIFIED'}</td>
                      <td className="py-3 px-4 font-mono text-stone-300">{healthCheck?.storage?.bucket || 'UNAVAILABLE'}</td>
                      <td
                        className={`py-3 px-4 font-mono font-bold text-[11px] ${renderStatusLabel(
                          !healthCheck ? 'NOT_VERIFIED' : healthCheck.storage.r2Configured ? 'CONNECTED' : 'STANDBY_LOCAL'
                        )}`}
                      >
                        {!healthCheck ? 'NOT_VERIFIED' : healthCheck.storage.r2Configured ? 'CONNECTED' : 'STANDBY_LOCAL'}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-3 px-4 font-semibold text-white">Git Commit SHA</td>
                      <td className="py-3 px-4 font-mono text-stone-300">{commitShaValue}</td>
                      <td className="py-3 px-4 font-mono text-stone-400">Runtime Env / Git</td>
                      <td
                        className={`py-3 px-4 font-mono font-bold text-[11px] ${renderStatusLabel(
                          commitShaValue === 'UNVERIFIED/BLOCKED' || commitShaValue === 'UNAVAILABLE' ? 'UNVERIFIED' : 'VERIFIED'
                        )}`}
                      >
                        {commitShaValue === 'UNVERIFIED/BLOCKED' || commitShaValue === 'UNAVAILABLE' ? 'UNVERIFIED' : 'VERIFIED'}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-3 px-4 font-semibold text-white">Cloud Run Revision</td>
                      <td className="py-3 px-4 font-mono text-stone-300">{cloudRunRevValue}</td>
                      <td className="py-3 px-4 font-mono text-stone-400">Env: {appEnvValue}</td>
                      <td
                        className={`py-3 px-4 font-mono font-bold text-[11px] ${renderStatusLabel(
                          cloudRunRevValue === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'VERIFIED'
                        )}`}
                      >
                        {cloudRunRevValue === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'DETECTED'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: System Health & Metrics */}
          {activeTab === 'system_health' && (
            <div className="space-y-5">
              {systemHealthError && (
                <div className="p-3 rounded-xl bg-rose-950/30 border border-rose-500/40 text-rose-200 text-xs flex items-center gap-2">
                  <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>System Health API Error: {systemHealthError}</span>
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
                      className="min-h-[32px] px-2.5 py-1 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-[11px] text-sky-300 flex items-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3 h-3 ${pingingFirestore ? 'animate-spin' : ''}`} />
                      <span>Ping</span>
                    </button>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl sm:text-3xl font-extrabold font-mono tabular-nums text-white">
                      {systemHealth && systemHealth.firestore.latencyMs >= 0
                        ? systemHealth.firestore.latencyMs
                        : 'UNAVAILABLE'}
                    </span>
                    {systemHealth && systemHealth.firestore.latencyMs >= 0 && (
                      <span className="text-xs text-sky-400 font-bold">ms roundtrip</span>
                    )}
                  </div>
                  <span
                    className={`text-[11px] block font-mono font-medium ${renderStatusLabel(
                      systemHealth?.firestore?.status || 'NOT_VERIFIED'
                    )}`}
                  >
                    Status: {systemHealth?.firestore?.status || 'NOT_VERIFIED'}
                  </span>
                </div>

                {/* Storage Driver Card */}
                <div className="p-5 rounded-2xl bg-black/40 border border-white/10 space-y-2">
                  <span className="flex items-center gap-1.5 text-xs text-stone-400 font-semibold">
                    <HardDrive className="w-4 h-4 text-emerald-400" />
                    <span>Storage Driver</span>
                  </span>
                  <div className="text-xl font-bold font-mono text-white truncate">
                    {systemHealth?.storage?.driver || 'UNAVAILABLE'}
                  </div>
                  <span className="text-[11px] text-stone-400 font-mono block truncate">
                    Bucket: {systemHealth?.storage?.bucket || 'UNAVAILABLE'}
                  </span>
                  <span
                    className={`text-[11px] font-mono block ${
                      systemHealth
                        ? systemHealth.storage.r2Configured
                          ? 'text-emerald-400'
                          : 'text-amber-300'
                        : 'text-stone-400'
                    }`}
                  >
                    R2 Configured: {systemHealth ? (systemHealth.storage.r2Configured ? 'YES' : 'NO') : 'NOT_VERIFIED'}
                  </span>
                </div>

                {/* Memory RSS Card */}
                <div className="p-5 rounded-2xl bg-black/40 border border-white/10 space-y-2">
                  <span className="flex items-center gap-1.5 text-xs text-stone-400 font-semibold">
                    <Server className="w-4 h-4 text-purple-400" />
                    <span>Container Memory</span>
                  </span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl sm:text-3xl font-extrabold font-mono tabular-nums text-white">
                      {systemHealth?.memory ? systemHealth.memory.rssMb : 'UNAVAILABLE'}
                    </span>
                    {systemHealth?.memory && <span className="text-xs text-purple-400 font-bold">MB RSS</span>}
                  </div>
                  <span className="text-[11px] text-stone-400 font-mono tabular-nums block">
                    {systemHealth?.memory
                      ? `Heap: ${systemHealth.memory.heapUsedMb} / ${systemHealth.memory.heapTotalMb} MB`
                      : 'Heap: UNAVAILABLE'}
                  </span>
                </div>
              </div>

              {/* Uptime and Real API Error Count */}
              <div className="p-4 rounded-xl bg-white/[0.04] border border-white/10 flex flex-wrap items-center justify-between gap-3 text-xs text-stone-300">
                <div className="flex items-center gap-2 font-mono tabular-nums">
                  <div
                    className={`w-2.5 h-2.5 rounded-full ${
                      systemHealth ? 'bg-emerald-400 animate-pulse' : 'bg-stone-500'
                    }`}
                  />
                  <span>
                    Uptime:{' '}
                    <strong className="text-white">
                      {systemHealth ? `${Math.floor(systemHealth.uptimeSeconds / 60)} min (${systemHealth.uptimeSeconds}s)` : 'UNAVAILABLE'}
                    </strong>
                  </span>
                </div>
                <div className="font-mono tabular-nums">
                  <span>
                    API 4xx/5xx ({systemHealth?.recentErrorsWindowMinutes ?? 15}m):{' '}
                    <strong
                      className={
                        !systemHealth
                          ? 'text-stone-400'
                          : systemHealth.recentErrorsCount > 0
                          ? 'text-rose-400'
                          : 'text-emerald-400'
                      }
                    >
                      {systemHealth ? systemHealth.recentErrorsCount : 'UNAVAILABLE'}
                    </strong>
                  </span>
                </div>
              </div>

              {/* Recent 4xx/5xx API Error Details when present */}
              {systemHealth?.recentApiErrors && systemHealth.recentApiErrors.length > 0 && (
                <div className="rounded-2xl border border-rose-500/30 bg-rose-950/15 p-3.5 space-y-2">
                  <div className="text-xs font-bold text-rose-300 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4" />
                    <span>Recent API Errors (Sanitized)</span>
                  </div>
                  <div className="space-y-1 font-mono text-[11px]">
                    {systemHealth.recentApiErrors.map((err, idx) => (
                      <div key={`${err.timestamp}-${idx}`} className="flex items-center justify-between text-stone-300">
                        <span className="truncate">
                          {err.method} {err.path}
                        </span>
                        <span className="text-rose-400 shrink-0 ml-2">
                          HTTP {err.status} · {err.timestamp.slice(11, 19)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 5: Admin Activity Logs */}
          {activeTab === 'logs' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <ScrollText className="w-4 h-4 text-purple-400" />
                    <span>Admin Audit Trail</span>
                  </h4>
                  <p className="text-[11px] text-stone-400">
                    Loaded from <code className="text-amber-300">/api/admin/logs</code> (backed by <code className="text-amber-300">admin_logs</code>).
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono tabular-nums text-stone-400">
                    Total: {totalLogs !== null ? `${totalLogs} events` : 'UNAVAILABLE'}
                  </span>
                  <button
                    type="button"
                    onClick={() => fetchLogs(logPage)}
                    disabled={logsLoading}
                    className="min-h-[36px] px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-stone-200 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${logsLoading ? 'animate-spin' : ''}`} />
                    <span>Reload</span>
                  </button>
                </div>
              </div>

              {logsError && (
                <div className="p-3 rounded-xl bg-rose-950/30 border border-rose-500/40 text-rose-200 text-xs flex items-center gap-2">
                  <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>Failed to load admin logs: {logsError}</span>
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
                          Loading admin activity logs...
                        </td>
                      </tr>
                    ) : logs.length > 0 ? (
                      logs.map((log) => (
                        <tr key={log.id} className="hover:bg-white/5 transition-colors">
                          <td className="py-2.5 px-3 font-mono tabular-nums text-[11px] text-stone-400 whitespace-nowrap">
                            {log.timestamp.slice(0, 19).replace('T', ' ')}
                          </td>
                          <td className="py-2.5 px-3 font-medium text-amber-200 truncate max-w-[150px]">
                            {log.actorEmail}
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`font-mono text-[11px] font-bold ${
                                log.action.includes('CREATED')
                                  ? 'text-emerald-400'
                                  : log.action.includes('DELETED')
                                  ? 'text-rose-400'
                                  : log.action.includes('UPDATED')
                                  ? 'text-amber-300'
                                  : 'text-purple-400'
                              }`}
                            >
                              {log.action}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-[11px] text-stone-400 truncate max-w-[130px]">
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
                          {logsError ? 'Logs unavailable due to API error.' : 'No admin activity logs recorded yet.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalLogs !== null && totalLogs > pageSize && (
                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    disabled={logPage === 0 || logsLoading}
                    onClick={() => {
                      const next = logPage - 1;
                      setLogPage(next);
                      fetchLogs(next);
                    }}
                    className="min-h-[40px] px-3.5 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-stone-200 disabled:opacity-40 flex items-center gap-1 cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span>Previous</span>
                  </button>
                  <span className="text-xs font-mono tabular-nums text-stone-400">
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
                    className="min-h-[40px] px-3.5 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-stone-200 disabled:opacity-40 flex items-center gap-1 cursor-pointer"
                  >
                    <span>Next</span>
                    <ChevronRight className="w-4 h-4" />
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
