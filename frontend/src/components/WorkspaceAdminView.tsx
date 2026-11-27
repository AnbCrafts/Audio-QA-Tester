import React, { useState, useEffect } from 'react';
import {
  Shield,
  Users,
  Webhook,
  ScrollText,
  Coins,
  Plus,
  Trash2,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  UserPlus,
} from 'lucide-react';
import { API_BASE_URL } from '@/config';
import {
  AuditLogItem,
  OrgMemberItem,
  OrgTokenQuota,
  WebhookDeliveryItem,
  WebhookEndpointItem,
} from '@/types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface WorkspaceAdminViewProps {
  tokenQuota: OrgTokenQuota | null;
  onQuotaUpdated: () => void;
}

export const WorkspaceAdminView: React.FC<WorkspaceAdminViewProps> = ({
  tokenQuota,
  onQuotaUpdated,
}) => {
  const [members, setMembers] = useState<OrgMemberItem[]>([]);
  const [webhooks, setWebhooks] = useState<WebhookEndpointItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [auditCursor, setAuditCursor] = useState<string | null>(null);
  const [auditHasMore, setAuditHasMore] = useState(false);

  const [selectedWebhookId, setSelectedWebhookId] = useState<string | null>(null);
  const [deliveries, setDeliveries] = useState<WebhookDeliveryItem[]>([]);

  const [dailyLimitInput, setDailyLimitInput] = useState<string>(
    String(tokenQuota?.dailyLimit ?? 500000)
  );
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberPassword, setNewMemberPassword] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<'MEMBER' | 'ADMIN'>('MEMBER');

  const [newWebhookUrl, setNewWebhookUrl] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<string[]>([
    'call.completed',
    'call.red_flag_detected',
    'commitment.created',
  ]);

  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (tokenQuota?.dailyLimit) {
      setDailyLimitInput(String(tokenQuota.dailyLimit));
    }
  }, [tokenQuota?.dailyLimit]);

  const loadAdminData = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const [mRes, wRes, aRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/org/members`, { credentials: 'include' }),
        fetch(`${API_BASE_URL}/api/org/webhooks`, { credentials: 'include' }),
        fetch(`${API_BASE_URL}/api/org/audit-logs?limit=25`, { credentials: 'include' }),
      ]);
      if (mRes.ok) setMembers(await mRes.json());
      if (wRes.ok) setWebhooks(await wRes.json());
      if (aRes.ok) {
        const logs = await aRes.json();
        setAuditLogs(logs.items || []);
        setAuditCursor(logs.nextCursor || null);
        setAuditHasMore(Boolean(logs.hasMore));
      }
    } catch (e: any) {
      setErrorMsg(e.message || 'Failed to load workspace administration data.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAdminData();
  }, []);

  const handleSaveQuota = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setStatusMsg(null);
    const parsed = parseInt(dailyLimitInput, 10);
    if (isNaN(parsed) || parsed < 1000) {
      setErrorMsg('Daily token limit must be at least 1,000.');
      return;
    }
    const res = await fetch(`${API_BASE_URL}/api/org/token-quota`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dailyLimit: parsed }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setErrorMsg(err.detail || 'Failed to update quota.');
      return;
    }
    setStatusMsg(`Daily token quota updated to ${parsed.toLocaleString()}.`);
    onQuotaUpdated();
    loadAdminData();
  };

  const handleCreateMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setStatusMsg(null);
    const res = await fetch(`${API_BASE_URL}/api/org/members`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: newMemberEmail,
        fullName: newMemberName,
        password: newMemberPassword,
        role: newMemberRole,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setErrorMsg(err.detail || 'Failed to add member.');
      return;
    }
    setNewMemberEmail('');
    setNewMemberName('');
    setNewMemberPassword('');
    setStatusMsg('Team member added to workspace.');
    loadAdminData();
  };

  const handleRoleToggle = async (member: OrgMemberItem) => {
    const nextRole = member.role === 'ADMIN' ? 'MEMBER' : 'ADMIN';
    setErrorMsg(null);
    setStatusMsg(null);
    const res = await fetch(`${API_BASE_URL}/api/org/members/${member.userId}/role`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: nextRole }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setErrorMsg(err.detail || 'Failed to change member role.');
      return;
    }
    setStatusMsg(`Updated ${member.email} to ${nextRole}.`);
    loadAdminData();
  };

  const handleCreateWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setStatusMsg(null);
    const res = await fetch(`${API_BASE_URL}/api/org/webhooks`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: newWebhookUrl, events: selectedEvents }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setErrorMsg(err.detail || 'Failed to register webhook.');
      return;
    }
    setNewWebhookUrl('');
    setStatusMsg('Webhook endpoint registered with HMAC-SHA256 signing.');
    loadAdminData();
  };

  const handleDeleteWebhook = async (webhookId: string) => {
    const res = await fetch(`${API_BASE_URL}/api/org/webhooks/${webhookId}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (res.ok) {
      if (selectedWebhookId === webhookId) {
        setSelectedWebhookId(null);
        setDeliveries([]);
      }
      setStatusMsg('Webhook endpoint removed.');
      loadAdminData();
    }
  };

  const handleInspectDeliveries = async (webhookId: string) => {
    setSelectedWebhookId(webhookId);
    const res = await fetch(`${API_BASE_URL}/api/org/webhooks/${webhookId}/deliveries`, {
      credentials: 'include',
    });
    if (res.ok) {
      setDeliveries(await res.json());
    }
  };

  const loadMoreAuditLogs = async () => {
    if (!auditCursor) return;
    const res = await fetch(
      `${API_BASE_URL}/api/org/audit-logs?limit=25&cursor=${encodeURIComponent(auditCursor)}`,
      { credentials: 'include' }
    );
    if (res.ok) {
      const logs = await res.json();
      setAuditLogs((prev) => [...prev, ...(logs.items || [])]);
      setAuditCursor(logs.nextCursor || null);
      setAuditHasMore(Boolean(logs.hasMore));
    }
  };

  const toggleEvent = (ev: string) => {
    setSelectedEvents((prev) =>
      prev.includes(ev) ? prev.filter((x) => x !== ev) : [...prev, ev]
    );
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-subtle pb-4">
        <div>
          <h2 className="font-display text-xl font-extrabold text-ink flex items-center gap-2">
            <Shield className="h-5 w-5 text-accent" />
            Workspace Administration &amp; Webhooks
          </h2>
          <p className="text-xs text-ink-muted mt-0.5">
            Manage team roles, daily token budgets, signed outbound webhooks, and immutable audit trails
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={loadAdminData}>
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {statusMsg && (
        <div className="rounded-xl border border-status-green/35 bg-status-green-soft px-4 py-2.5 text-xs text-status-green font-semibold flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{statusMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div className="rounded-xl border border-status-red/35 bg-status-red-soft px-4 py-2.5 text-xs text-status-red font-semibold flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Daily Token Quota */}
        <Card className="p-5 space-y-4">
          <h3 className="font-display text-sm font-extrabold text-ink flex items-center gap-2">
            <Coins className="h-4 w-4 text-accent" />
            Daily Tenant Token Quota
          </h3>
          <form onSubmit={handleSaveQuota} className="flex flex-col sm:flex-row gap-2">
            <Input
              type="number"
              min={1000}
              max={100000000}
              value={dailyLimitInput}
              onChange={(e) => setDailyLimitInput(e.target.value)}
              className="flex-1 font-mono"
            />
            <Button type="submit">Save Quota</Button>
          </form>
          {tokenQuota && (
            <p className="text-[11px] text-ink-muted">
              Current usage: <strong className="text-ink">{tokenQuota.usedToday.toLocaleString()}</strong> /{' '}
              <strong className="text-ink">{tokenQuota.dailyLimit.toLocaleString()}</strong> tokens ({tokenQuota.usagePct}%)
            </p>
          )}
        </Card>

        {/* Team Members */}
        <Card className="p-5 space-y-4">
          <h3 className="font-display text-sm font-extrabold text-ink flex items-center gap-2">
            <Users className="h-4 w-4 text-accent" />
            Team Members ({members.length})
          </h3>
          <form onSubmit={handleCreateMember} className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Input
              type="email"
              required
              placeholder="teammate@company.com"
              value={newMemberEmail}
              onChange={(e) => setNewMemberEmail(e.target.value)}
            />
            <Input
              type="text"
              placeholder="Full Name"
              value={newMemberName}
              onChange={(e) => setNewMemberName(e.target.value)}
            />
            <Input
              type="password"
              required
              minLength={6}
              placeholder="Temp password (min 6 chars)"
              value={newMemberPassword}
              onChange={(e) => setNewMemberPassword(e.target.value)}
            />
            <div className="flex gap-2">
              <select
                value={newMemberRole}
                onChange={(e) => setNewMemberRole(e.target.value as 'MEMBER' | 'ADMIN')}
                className="rounded-xl border border-subtle bg-canvas px-2.5 py-1.5 text-xs text-ink"
              >
                <option value="MEMBER">MEMBER</option>
                <option value="ADMIN">ADMIN</option>
              </select>
              <Button type="submit" className="flex-1">
                <UserPlus className="h-3.5 w-3.5" />
                Add
              </Button>
            </div>
          </form>
          <div className="divide-y divide-subtle max-h-48 overflow-y-auto text-xs">
            {members.map((m) => (
              <div key={m.userId} className="py-2 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold text-ink truncate">{m.email}</div>
                  <div className="text-[11px] text-ink-muted">{m.fullName || 'No name'}</div>
                </div>
                <button
                  type="button"
                  onClick={() => handleRoleToggle(m)}
                  className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold border cursor-pointer transition-colors ${
                    m.role === 'ADMIN'
                      ? 'border-accent/40 bg-accent-soft text-accent'
                      : 'border-subtle bg-canvas text-ink-muted hover:text-ink'
                  }`}
                >
                  {m.role}
                </button>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Outbound Webhooks */}
      <Card className="p-5 space-y-4">
        <h3 className="font-display text-sm font-extrabold text-ink flex items-center gap-2">
          <Webhook className="h-4 w-4 text-status-green" />
          Signed Outbound Webhooks (HMAC-SHA256)
        </h3>
        <form onSubmit={handleCreateWebhook} className="space-y-2.5">
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              type="url"
              required
              placeholder="https://hooks.slack.com/services/..."
              value={newWebhookUrl}
              onChange={(e) => setNewWebhookUrl(e.target.value)}
              className="flex-1"
            />
            <Button type="submit">
              <Plus className="h-3.5 w-3.5" />
              Register Webhook
            </Button>
          </div>
          <div className="flex flex-wrap gap-3 text-[11px] text-ink-muted">
            {['call.completed', 'call.red_flag_detected', 'commitment.created'].map((ev) => (
              <label key={ev} className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedEvents.includes(ev)}
                  onChange={() => toggleEvent(ev)}
                  style={{ accentColor: 'var(--accent-primary)' }}
                />
                <span className="font-mono text-ink">{ev}</span>
              </label>
            ))}
          </div>
        </form>

        {webhooks.length === 0 ? (
          <p className="text-xs text-ink-muted">No webhook endpoints registered yet.</p>
        ) : (
          <div className="divide-y divide-subtle text-xs">
            {webhooks.map((wh) => (
              <div
                key={wh.id}
                className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <div className="font-mono text-ink truncate font-semibold">{wh.url}</div>
                  <div className="text-[11px] text-ink-muted">
                    Secret: <span className="font-mono">{wh.secretPreview}</span> &bull; Events:{' '}
                    {wh.events.join(', ')}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleInspectDeliveries(wh.id)}
                  >
                    Deliveries
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    onClick={() => handleDeleteWebhook(wh.id)}
                    title="Delete webhook"
                    className="h-8 w-8"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {selectedWebhookId && (
          <div className="rounded-xl border border-subtle bg-canvas p-3.5 space-y-2">
            <div className="text-[11px] font-bold text-ink">Recent Delivery Attempts</div>
            {deliveries.length === 0 ? (
              <p className="text-[11px] text-ink-muted">No deliveries logged for this endpoint yet.</p>
            ) : (
              <div className="space-y-1 text-[11px] font-mono">
                {deliveries.map((d) => (
                  <div key={d.id} className="flex items-center justify-between gap-2 text-ink">
                    <span>
                      {d.eventType} ({d.attempts}x)
                    </span>
                    <Badge
                      variant={
                        d.status === 'DELIVERED'
                          ? 'green'
                          : d.status === 'DEAD_LETTER'
                          ? 'red'
                          : 'accent'
                      }
                    >
                      {d.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Audit Log */}
      <Card className="p-5 space-y-3">
        <h3 className="font-display text-sm font-extrabold text-ink flex items-center gap-2">
          <ScrollText className="h-4 w-4 text-accent" />
          Workspace Audit Log
        </h3>
        {auditLogs.length === 0 ? (
          <p className="text-xs text-ink-muted">
            No administrative or compliance actions recorded yet.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Timestamp</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Target / Metadata</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {auditLogs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="font-mono text-[11px] text-ink-muted whitespace-nowrap">
                    {log.createdAt}
                  </TableCell>
                  <TableCell>{log.actorEmail}</TableCell>
                  <TableCell>
                    <Badge variant="accent" className="rounded-md font-mono text-[10px]">
                      {log.action}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-[11px] text-ink-muted truncate max-w-[320px]">
                    {log.targetId ? `${log.targetId} ` : ''}
                    {JSON.stringify(log.metadata)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {auditHasMore && (
          <Button type="button" variant="outline" size="sm" onClick={loadMoreAuditLogs}>
            Load Older Events
          </Button>
        )}
      </Card>
    </div>
  );
};
