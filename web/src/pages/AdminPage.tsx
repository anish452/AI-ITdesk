import { useEffect, useState } from 'react';
import { Button } from '../components/ui/button';
import { Card, CardBody, CardHeader } from '../components/ui/card';
import { Field, Input, Select } from '../components/ui/field';
import { api, type User } from '../lib/api';
import { useAuth } from '../lib/auth';
import { pretty, when } from '../lib/utils';

type AuditEvent = { id: string; actorEmail: string | null; action: string; entityType: string; createdAt: string };

export function AdminPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [threshold, setThreshold] = useState(0.42);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'TECHNICIAN', department: 'IT Operations', plant: 'Auckland Pack' });
  const admin = user?.role === 'ADMIN';

  function load() {
    api<{ events: AuditEvent[] }>('/api/audit').then((result) => setEvents(result.events)).catch((err: Error) => setError(err.message));
    api<{ settings: { confidenceThreshold: number } }>('/api/settings').then((result) => setThreshold(result.settings.confidenceThreshold)).catch(() => undefined);
    if (admin) api<{ users: User[] }>('/api/users').then((result) => setUsers(result.users)).catch((err: Error) => setError(err.message));
  }

  useEffect(() => { load(); }, [admin]);

  return (
    <div className="mx-auto grid max-w-6xl gap-6">
      <header>
        <p className="text-xs tracking-[0.16em] text-muted">ADMINISTRATION</p>
        <h1 className="mt-1 font-serif text-4xl">Access, threshold, and audit</h1>
      </header>
      {error && <p className="text-sm text-bad">{error}</p>}
      {admin && (
        <Card>
          <CardHeader><h2 className="font-serif text-2xl">Escalation threshold</h2></CardHeader>
          <CardBody className="space-y-3 text-sm">
            <p className="text-muted">If classification confidence is below {threshold.toFixed(2)}, the request is escalated for a person to confirm. The recommendation is still drafted, and it is marked as less reliable.</p>
            <input type="range" min={0.15} max={0.85} step={0.01} value={threshold} onChange={(event) => setThreshold(Number(event.target.value))} className="w-full" />
            <Button type="button" onClick={() => api('/api/settings', { method: 'PATCH', body: JSON.stringify({ confidenceThreshold: threshold }) }).then(load).catch((err: Error) => setError(err.message))}>Save threshold</Button>
          </CardBody>
        </Card>
      )}
      {admin && (
        <div className="grid gap-5 lg:grid-cols-[1fr_0.8fr]">
          <Card>
            <CardHeader><h2 className="font-serif text-2xl">People</h2></CardHeader>
            <div className="divide-y divide-line text-sm">
              {users.map((person) => (
                <div key={person.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <div>{person.name}</div>
                    <div className="text-xs text-muted">{person.email} · {pretty(person.role)} · {person.plant}</div>
                  </div>
                  <Button variant="outline" type="button" onClick={() => api(`/api/users/${person.id}`, { method: 'PATCH', body: JSON.stringify({ active: person.active === false }) }).then(load)}>
                    {person.active === false ? 'Activate' : 'Deactivate'}
                  </Button>
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <CardHeader><h2 className="font-serif text-2xl">New account</h2></CardHeader>
            <CardBody>
              <form className="grid gap-2" onSubmit={(event) => {
                event.preventDefault();
                api('/api/users', { method: 'POST', body: JSON.stringify(form) }).then(() => load()).catch((err: Error) => setError(err.message));
              }}>
                <Field label="Name"><Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>
                <Field label="Email"><Input value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></Field>
                <Field label="Password"><Input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></Field>
                <Field label="Role">
                  <Select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>
                    {['EMPLOYEE', 'TECHNICIAN', 'MANAGER', 'ADMIN'].map((role) => <option key={role}>{role}</option>)}
                  </Select>
                </Field>
                <Field label="Department"><Input value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })} /></Field>
                <Field label="Plant"><Input value={form.plant} onChange={(event) => setForm({ ...form, plant: event.target.value })} /></Field>
                <Button type="submit">Create account</Button>
              </form>
            </CardBody>
          </Card>
        </div>
      )}
      <Card>
        <CardHeader><h2 className="font-serif text-2xl">Audit log</h2></CardHeader>
        <div className="divide-y divide-line text-sm">
          {events.map((event) => (
            <div key={event.id} className="grid grid-cols-[160px_1fr_180px] gap-3 px-5 py-3">
              <span className="text-xs text-muted">{when(event.createdAt)}</span>
              <span>{event.action}</span>
              <span className="text-right text-xs text-muted">{event.actorEmail ?? 'system'} · {event.entityType}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
