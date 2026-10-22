import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardBody, CardHeader } from '../components/ui/card';
import { Field, Input, TextArea } from '../components/ui/field';
import { api } from '../lib/api';
import { pretty, ticketNo, when } from '../lib/utils';

type TicketRow = {
  id: string;
  number: number;
  title: string;
  status: string;
  category: string | null;
  priority: string | null;
  plant: string;
  createdAt: string;
  affectedSystem: string;
};

export function EmployeeHome() {
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [affectedSystem, setAffectedSystem] = useState('SAP S/4HANA');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function load() {
    api<{ tickets: TicketRow[] }>('/api/tickets').then((result) => setTickets(result.tickets)).catch((err: Error) => setError(err.message));
  }

  useEffect(() => { load(); }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/api/tickets', { method: 'POST', body: JSON.stringify({ title, description, affectedSystem }) });
      setTitle('');
      setDescription('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit the request');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-6">
      <header>
        <p className="text-xs tracking-[0.16em] text-muted">EMPLOYEE PORTAL</p>
        <h1 className="mt-1 font-serif text-4xl">Raise a support request</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">Describe the system and what you were trying to do. The desk classifies the request and prepares evidence for a technician. It will not change accounts, equipment, or the network by itself.</p>
      </header>
      <div className="grid items-start gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardHeader>
            <h2 className="font-serif text-2xl">New request</h2>
          </CardHeader>
          <CardBody>
            <form onSubmit={submit} className="space-y-3">
              <Field label="Title">
                <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Cannot open a purchase order in SAP" />
              </Field>
              <Field label="Affected system">
                <Input value={affectedSystem} onChange={(event) => setAffectedSystem(event.target.value)} />
              </Field>
              <Field label="What happened">
                <TextArea rows={6} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Plant, transaction or station, and whether production or shipping is waiting." />
              </Field>
              {error && <p className="text-sm text-bad">{error}</p>}
              <Button type="submit" disabled={busy}>{busy ? 'Sending…' : 'Submit request'}</Button>
            </form>
          </CardBody>
        </Card>
        <Card>
          <CardHeader className="flex items-center justify-between">
            <h2 className="font-serif text-2xl">Your tickets</h2>
          </CardHeader>
          <div className="divide-y divide-line">
            {tickets.length === 0 && <p className="px-5 py-6 text-sm text-muted">No requests yet.</p>}
            {tickets.map((ticket) => (
              <Link key={ticket.id} to={`/tickets/${ticket.id}`} className="grid grid-cols-[110px_1fr_auto] gap-3 px-5 py-4 hover:bg-paper">
                <div>
                  <div className="text-sm font-medium">{ticketNo(ticket.number)}</div>
                  <div className="text-xs text-muted">{when(ticket.createdAt)}</div>
                </div>
                <div>
                  <div className="text-sm">{ticket.title}</div>
                  <div className="mt-1 text-xs text-muted">{ticket.affectedSystem} · {ticket.plant}</div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge value={ticket.status}>{pretty(ticket.status)}</Badge>
                  {ticket.priority && <Badge value={ticket.priority}>{ticket.priority}</Badge>}
                </div>
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
