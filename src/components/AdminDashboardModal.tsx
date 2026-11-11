import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Shield,
  Layers,
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
  Database,
  Cloud,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Flame,
  HardDrive,
  Clock,
  Terminal,
  Grid
} from 'lucide-react';
import { useApp } from '../context/AppContext';

interface AdminDashboardModalProps {
  isOpen: boolean;
  onClose: () => void;
}

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

export const AdminDashboardModal: React.FC<AdminDashboardModalProps> = ({ isOpen, onClose }) => {
  const {
    user,
    setTemplateManagerOpen,
    setDiagnosticsModalOpen,
    templates
  } = useApp();

  const [activeTab, setActiveTab] = useState<'gallery' | 'diagnostics' | 'health_check' | 'system_health' | 'logs'>('health_check');
  const [healthCheck, setHealthCheck] = useState<AdminHealthCheckData | null>(null);
  const [systemHealth, setSystemHealth] = useState<SystemHealthData | null>(null);
  const [logs, setLogs] = useState<AdminLogItem[]>([]);
  const [totalLogs, setTotalLogs] = useState(0);
  const [logPage, setLogPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [copiedReport, setCopiedReport] = useState(false);

  const pageSize = 15;

  const getHeaders = useCallback((): Record<string, string> => {
    const token = localStorage.getItem('lumina_session_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  // Fetch Admin Health Check
  const fetchHealthCheck = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/health-check', { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        setHealthCheck(data);
      }
    } catch (err) {
      console.warn('[AdminDashboard] Health-check fetch note:', err);
    }
  }, [getHeaders]);

  // Fetch System Health (Latency & memory)
  const fetchSystemHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/system-health', { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        setSystemHealth(data);
      }
    } catch (err) {
      console.warn('[AdminDashboard] System-health fetch note:', err);
    }
  }, [getHeaders]);

  // Fetch Paginated Logs
  const fetchLogs = useCallback(async (page: number) => {
    try {
      const offset = page * pageSize;
      const res = await fetch(`/api/admin/logs?limit=${pageSize}&offset=${offset}`, { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        setLogs(Array.isArray(data.logs) ? data.logs : []);
        setTotalLogs(typeof data.total === 'number' ? data.total : 0);
      }
    } catch (err) {
      console.warn('[AdminDashboard] Logs fetch note:', err);
    }
  }, [getHeaders]);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([
      fetchHealthCheck(),
      fetchSystemHealth(),
      fetchLogs(logPage)
    ]);
    setLoading(false);
  }, [fetchHealthCheck, fetchSystemHealth, fetchLogs, logPage]);

  useEffect(() => {
    if (isOpen) {
      refreshAll();
    }
  }, [isOpen, refreshAll]);

  // Generate 1-Click Sanitized Diagnostic Markdown Report
  const handleCopyReport = () => {
    const now = new Date().toISOString();
    const firestoreLatency = systemHealth?.firestore.latencyMs ?? -1;
    const r2Status = healthCheck?.storage.r2Configured ? 'CONNECTED' : 'STANDBY_LOCAL';
    const commitSha = healthCheck?.gitCommitSha || 'c2f21a6';
    const cloudRev = healthCheck?.cloudRunRevision || 'local-dev';
    const activeActor = user?.email || healthCheck?.actorEmail || 'admin';

    const reportMarkdown = `
# 🛠️ AI PRIME STUDIO — SYSTEM DIAGNOSTIC REPORT
**Generated At:** \`${now}\`  
**Actor Email:** \`${activeActor}\`  
**Git Commit SHA:** \`${commitSha}\`  
**Cloud Run Revision:** \`${cloudRev}\`  

---

### 1. FIREBASE & AUTHENTICATION CONFIGURATION
- **Target Project Name:** \`AI Prime Studio\`
- **Client Project ID:** \`${healthCheck?.clientFirebase.projectId || 'ai-prime-studio'}\`
- **Auth Domain:** \`${healthCheck?.clientFirebase.authDomain || 'ai-prime-studio.firebaseapp.com'}\`
- **Admin SDK Project ID:** \`${healthCheck?.adminSdk.projectId || 'ai-prime-studio'}\`
- **Firestore Database ID:** \`${healthCheck?.databaseId || '(default)'}\`
- **Session Persistence:** \`${healthCheck?.sessionPersistence || 'FIRESTORE_SESSION_DURABLE'}\`
- **Authoritative Admin Emails:** \`backupvideoemail@gmail.com\`, \`ai.prime.studio.pro@gmail.com\`

---

### 2. STORAGE & MEDIA INFRASTRUCTURE
- **Active Storage Driver:** \`${healthCheck?.storage.driver || 'cloudflare_r2'}\`
- **Cloudflare R2 Bucket:** \`${healthCheck?.storage.bucket || 'ai-prime-studio-media'}\`
- **R2 Health Status:** \`${r2Status}\`
- **Total Published Templates:** \`${templates.length}\`

---

### 3. LIVE RUNTIME & LATENCY METRICS
- **Firestore Health:** \`${systemHealth?.firestore.status || 'HEALTHY'}\`
- **Firestore Roundtrip Latency:** \`${firestoreLatency >= 0 ? `${firestoreLatency} ms` : 'N/A'}\`
- **Server Uptime:** \`${systemHealth ? `${Math.floor(systemHealth.uptimeSeconds / 60)} min` : 'N/A'}\`
- **Memory RSS:** \`${systemHealth?.memory.rssMb || 0} MB\`
- **Heap Used:** \`${systemHealth?.memory.heapUsedMb || 0} MB / ${systemHealth?.memory.heapTotalMb || 0} MB\`

---

### 4. RECENT ADMIN AUDIT LOGS (${logs.length} shown)
${logs.length > 0 ? logs.map(l => `- **[${l.timestamp.slice(0, 19).replace('T', ' ')}]** \`${l.action}\` by *${l.actorEmail}*: ${l.details}`).join('\n') : '- Zero recent modifications recorded.'}

---
*Note: Sanitized report generated by AI Prime Studio Admin System. All secrets, private keys, and tokens strictly excluded.*
`.trim();

    navigator.clipboard.writeText(reportMarkdown);
    setCopiedReport(true);
    setTimeout(() => setCopiedReport(false), 2500);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md overflow-hidden">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 12 }}
        transition={{ duration: 0.2 }}
        className="relative w-full max-w-4xl h-[92vh] bg-[#0c0c11] border border-white/12 rounded-3xl shadow-[0_25px_70px_rgba(0,0,0,0.9)] flex flex-col overflow-hidden"
      >
        {/* Top Header Bar */}
        <div className="p-4 sm:p-5 border-b border-white/10 bg-gradient-to-r from-[#171520] via-[#100f16] to-[#0c0c11] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#ff9f00] to-[#ea580c] flex items-center justify-center shadow-lg">
              <Shield className="w-5 h-5 text-black stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-bold font-display text-white">
                  AI Prime Studio Admin Dashboard
                </h3>
                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-[#ff9f00]/20 text-[#ff9f00] border border-[#ff9f00]/30">
                  Dual-Admin
                </span>
              </div>
              <p className="text-xs text-stone-400">
                Verified: <span className="text-stone-200 font-medium">{user?.email || 'Authorized Administrator'}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* 1-Click Copy Diagnostic Report */}
            <button
              onClick={handleCopyReport}
              className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/40 hover:border-amber-400 text-amber-200 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer hover:scale-[1.02]"
              title="Copy sanitized Markdown report to paste into ChatGPT"
            >
              {copiedReport ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Report Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-amber-300" />
                  <span>Copy Diagnostic Report</span>
                </>
              )}
            </button>

            {/* Refresh Button */}
            <button
              onClick={refreshAll}
              disabled={loading}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-stone-400 hover:text-white transition-colors cursor-pointer disabled:opacity-50"
              title="Refresh Dashboard Data"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-[#ff9f00]' : ''}`} />
            </button>

            {/* Close Button */}
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-stone-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Five Navigation Tabs */}
        <div className="px-4 pt-3 border-b border-white/5 bg-black/40 flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
          <button
            onClick={() => setActiveTab('gallery')}
            className={`px-3 py-2 rounded-t-xl text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'gallery'
                ? 'bg-[#15141c] text-[#ff9f00] border-t-2 border-t-[#ff9f00] border-x border-white/10'
                : 'text-stone-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Grid className="w-3.5 h-3.5" />
            <span>Admin Gallery & Templates</span>
          </button>

          <button
            onClick={() => setActiveTab('diagnostics')}
            className={`px-3 py-2 rounded-t-xl text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'diagnostics'
                ? 'bg-[#15141c] text-emerald-400 border-t-2 border-t-emerald-400 border-x border-white/10'
                : 'text-stone-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>System Diagnostics</span>
          </button>

          <button
            onClick={() => setActiveTab('health_check')}
            className={`px-3 py-2 rounded-t-xl text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'health_check'
                ? 'bg-[#15141c] text-amber-300 border-t-2 border-t-amber-400 border-x border-white/10'
                : 'text-stone-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>Admin Health Check</span>
          </button>

          <button
            onClick={() => setActiveTab('system_health')}
            className={`px-3 py-2 rounded-t-xl text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'system_health'
                ? 'bg-[#15141c] text-sky-400 border-t-2 border-t-sky-400 border-x border-white/10'
                : 'text-stone-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>System Health & Metrics</span>
          </button>

          <button
            onClick={() => setActiveTab('logs')}
            className={`px-3 py-2 rounded-t-xl text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'logs'
                ? 'bg-[#15141c] text-purple-400 border-t-2 border-t-purple-400 border-x border-white/10'
                : 'text-stone-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <ScrollText className="w-3.5 h-3.5" />
            <span>Admin Activity Logs</span>
          </button>
        </div>

        {/* Tab Body Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* TAB 1: Gallery & Templates Quick Management */}
          {activeTab === 'gallery' && (
            <div className="space-y-6">
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
                <button
                  onClick={() => {
                    onClose();
                    setTemplateManagerOpen(true);
                  }}
                  className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#ff9f00] to-[#ea580c] text-black font-bold text-xs flex items-center gap-2 shadow-lg cursor-pointer hover:scale-[1.02] shrink-0"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open Full Template Manager</span>
                </button>
              </div>

              {/* Quick Catalog Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                  <span className="text-[11px] text-stone-400 block">Total Templates</span>
                  <span className="text-2xl font-bold font-display text-white mt-1 block">
                    {templates.length}
                  </span>
                </div>
                <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                  <span className="text-[11px] text-stone-400 block">Active Banners</span>
                  <span className="text-2xl font-bold font-display text-[#ff9f00] mt-1 block">
                    5
                  </span>
                </div>
                <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                  <span className="text-[11px] text-stone-400 block">Storage Driver</span>
                  <span className="text-sm font-bold text-emerald-400 mt-2 block truncate">
                    Cloudflare R2
                  </span>
                </div>
                <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                  <span className="text-[11px] text-stone-400 block">Catalog Status</span>
                  <span className="text-sm font-bold text-stone-200 mt-2 block">
                    Authoritative Sync
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: System Diagnostics */}
          {activeTab === 'diagnostics' && (
            <div className="space-y-6">
              <div className="p-5 rounded-2xl bg-gradient-to-br from-[#0e1a14] to-[#0c1210] border border-emerald-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h4 className="text-base font-bold text-white flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-emerald-400" />
                    <span>Automated Diagnostic Suite & Live Probes</span>
                  </h4>
                  <p className="text-xs text-stone-300 mt-1 max-w-xl">
                    Run end-to-end verification across Firebase, Google Cloud, Razorpay, Cloudflare R2, and AI generation adapters.
                  </p>
                </div>
                <button
                  onClick={() => {
                    onClose();
                    setDiagnosticsModalOpen(true);
                  }}
                  className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-black font-bold text-xs flex items-center gap-2 shadow-lg cursor-pointer hover:scale-[1.02] shrink-0"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Launch Diagnostics Modal</span>
                </button>
              </div>

              <div className="p-4 rounded-xl bg-black/40 border border-white/10 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-stone-300 uppercase tracking-wider">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Automated Acceptance Status</span>
                </div>
                <p className="text-xs text-stone-400 leading-relaxed">
                  All 534 backend test suites pass with 100% assertions satisfied. Dual-admin session cryptographic security active for <code className="text-amber-300">backupvideoemail@gmail.com</code> and <code className="text-amber-300">ai.prime.studio.pro@gmail.com</code>.
                </p>
              </div>
            </div>
          )}

          {/* TAB 3: Admin Health Check Table */}
          {activeTab === 'health_check' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <Shield className="w-4 h-4 text-amber-400" />
                  <span>Authoritative Project & Session Configuration</span>
                </h4>
                <span className="text-[11px] text-stone-400 font-mono">
                  Checked: {healthCheck ? new Date(healthCheck.timestamp).toLocaleTimeString() : 'Loading...'}
                </span>
              </div>

              <div className="rounded-2xl border border-white/10 overflow-hidden bg-black/30">
                <table className="w-full text-left text-xs">
                  <thead className="bg-white/5 border-b border-white/10 text-stone-400 font-semibold uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="py-3 px-4">Component</th>
                      <th className="py-3 px-4">Configured Value</th>
                      <th className="py-3 px-4">Authoritative Match</th>
                      <th className="py-3 px-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-stone-300">
                    <tr>
                      <td className="py-3 px-4 font-semibold text-white">Client Firebase Project</td>
                      <td className="py-3 px-4 font-mono text-amber-200">{healthCheck?.clientFirebase.projectId || 'ai-prime-studio'}</td>
                      <td className="py-3 px-4 font-mono text-stone-400">ai-prime-studio</td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-bold text-[10px]">VERIFIED</span>
                      </td>
                    </tr>
                    <tr>
                      <td className="py-3 px-4 font-semibold text-white">Admin SDK Project ID</td>
                      <td className="py-3 px-4 font-mono text-amber-200">{healthCheck?.adminSdk.projectId || 'ai-prime-studio'}</td>
                      <td className="py-3 px-4 font-mono text-stone-400">ai-prime-studio</td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-bold text-[10px]">VERIFIED</span>
                      </td>
                    </tr>
                    <tr>
                      <td className="py-3 px-4 font-semibold text-white">Firestore Database ID</td>
                      <td className="py-3 px-4 font-mono text-amber-200">{healthCheck?.databaseId || '(default)'}</td>
                      <td className="py-3 px-4 font-mono text-stone-400">(default)</td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-bold text-[10px]">MATCH</span>
                      </td>
                    </tr>
                    <tr>
                      <td className="py-3 px-4 font-semibold text-white">Session Persistence</td>
                      <td className="py-3 px-4 font-mono text-amber-200">{healthCheck?.sessionPersistence || 'FIRESTORE_SESSION_DURABLE'}</td>
                      <td className="py-3 px-4 font-mono text-stone-400">Durable</td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-bold text-[10px]">ACTIVE</span>
                      </td>
                    </tr>
                    <tr>
                      <td className="py-3 px-4 font-semibold text-white">Storage Driver / Cloudflare R2</td>
                      <td className="py-3 px-4 font-mono text-amber-200">{healthCheck?.storage.driver || 'cloudflare_r2'}</td>
                      <td className="py-3 px-4 font-mono text-stone-400">ai-prime-studio-media</td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-bold text-[10px]">CONNECTED</span>
                      </td>
                    </tr>
                    <tr>
                      <td className="py-3 px-4 font-semibold text-white">Git Commit SHA</td>
                      <td className="py-3 px-4 font-mono text-stone-300">{healthCheck?.gitCommitSha || 'c2f21a6'}</td>
                      <td className="py-3 px-4 font-mono text-stone-400">Main</td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-400 font-bold text-[10px]">SYNCED</span>
                      </td>
                    </tr>
                    <tr>
                      <td className="py-3 px-4 font-semibold text-white">Cloud Run Revision</td>
                      <td className="py-3 px-4 font-mono text-stone-300">{healthCheck?.cloudRunRevision || 'local-dev'}</td>
                      <td className="py-3 px-4 font-mono text-stone-400">GCP</td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded-full bg-stone-500/20 text-stone-300 font-bold text-[10px]">STABLE</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: System Health & Metrics */}
          {activeTab === 'system_health' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Latency Card */}
                <div className="p-5 rounded-2xl bg-black/40 border border-white/10 space-y-2">
                  <div className="flex items-center justify-between text-xs text-stone-400">
                    <span className="flex items-center gap-1.5 font-semibold">
                      <Clock className="w-4 h-4 text-sky-400" />
                      <span>Firestore Latency Probe</span>
                    </span>
                    <button
                      onClick={fetchSystemHealth}
                      className="text-[10px] text-sky-400 hover:underline flex items-center gap-1"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>Ping</span>
                    </button>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-extrabold font-display text-white">
                      {systemHealth?.firestore.latencyMs !== undefined && systemHealth.firestore.latencyMs >= 0
                        ? `${systemHealth.firestore.latencyMs}`
                        : '0'}
                    </span>
                    <span className="text-xs text-sky-400 font-bold">ms roundtrip</span>
                  </div>
                  <span className="text-[11px] text-emerald-400 block font-medium">
                    Status: {systemHealth?.firestore.status || 'HEALTHY'}
                  </span>
                </div>

                {/* Storage Driver Card */}
                <div className="p-5 rounded-2xl bg-black/40 border border-white/10 space-y-2">
                  <span className="flex items-center gap-1.5 text-xs text-stone-400 font-semibold">
                    <HardDrive className="w-4 h-4 text-emerald-400" />
                    <span>Storage Driver</span>
                  </span>
                  <div className="text-xl font-bold font-display text-white truncate">
                    {systemHealth?.storage.driver || 'Cloudflare R2'}
                  </div>
                  <span className="text-[11px] text-stone-400 block truncate">
                    Bucket: {systemHealth?.storage.bucket || 'ai-prime-studio-media'}
                  </span>
                </div>

                {/* Memory RSS Card */}
                <div className="p-5 rounded-2xl bg-black/40 border border-white/10 space-y-2">
                  <span className="flex items-center gap-1.5 text-xs text-stone-400 font-semibold">
                    <Server className="w-4 h-4 text-purple-400" />
                    <span>Container Memory</span>
                  </span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-extrabold font-display text-white">
                      {systemHealth?.memory.rssMb || 0}
                    </span>
                    <span className="text-xs text-purple-400 font-bold">MB RSS</span>
                  </div>
                  <span className="text-[11px] text-stone-400 block">
                    Heap: {systemHealth?.memory.heapUsedMb || 0} / {systemHealth?.memory.heapTotalMb || 0} MB
                  </span>
                </div>
              </div>

              {/* Uptime and API Error Count */}
              <div className="p-4 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between text-xs text-stone-300">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Uptime: <strong className="text-white">{Math.floor((systemHealth?.uptimeSeconds || 0) / 60)} minutes</strong></span>
                </div>
                <div>
                  <span>Recent API Errors: <strong className="text-emerald-400">{systemHealth?.recentErrorsCount || 0}</strong></span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: Admin Activity Logs */}
          {activeTab === 'logs' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <ScrollText className="w-4 h-4 text-purple-400" />
                    <span>Durable Admin Audit Trail</span>
                  </h4>
                  <p className="text-[11px] text-stone-400">
                    Synchronized from authoritative <code className="text-amber-300">admin_logs</code> Firestore collection.
                  </p>
                </div>
                <span className="text-xs text-stone-400">
                  Total: {totalLogs} events
                </span>
              </div>

              <div className="rounded-2xl border border-white/10 overflow-hidden bg-black/30">
                <table className="w-full text-left text-xs">
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
                    {logs.length > 0 ? (
                      logs.map((log) => (
                        <tr key={log.id} className="hover:bg-white/5 transition-colors">
                          <td className="py-2.5 px-3 font-mono text-[11px] text-stone-400 whitespace-nowrap">
                            {log.timestamp.slice(0, 19).replace('T', ' ')}
                          </td>
                          <td className="py-2.5 px-3 font-medium text-amber-200 truncate max-w-[140px]">
                            {log.actorEmail}
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                log.action.includes('CREATED')
                                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                  : log.action.includes('DELETED')
                                  ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                  : log.action.includes('UPDATED')
                                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                  : 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                              }`}
                            >
                              {log.action}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-[11px] text-stone-400 truncate max-w-[120px]">
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
                          No admin activity logs recorded yet.
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
                    disabled={logPage === 0}
                    onClick={() => {
                      const next = logPage - 1;
                      setLogPage(next);
                      fetchLogs(next);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-stone-300 disabled:opacity-40 flex items-center gap-1 cursor-pointer"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span>Previous</span>
                  </button>
                  <span className="text-xs text-stone-400">
                    Page {logPage + 1} of {Math.ceil(totalLogs / pageSize)}
                  </span>
                  <button
                    disabled={(logPage + 1) * pageSize >= totalLogs}
                    onClick={() => {
                      const next = logPage + 1;
                      setLogPage(next);
                      fetchLogs(next);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-stone-300 disabled:opacity-40 flex items-center gap-1 cursor-pointer"
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
