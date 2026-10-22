import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '../components/ui/badge';
import { Card } from '../components/ui/card';
import { api } from '../lib/api';
import { pretty, ticketNo, when } from '../lib/utils';

type TicketRow = {
  id: string;
  number: number;
  title: string;
  status: string;
  category: string | null;
  urgency: string | null;
  priority: string | null;
  confidence: number | null;
  plant: string;
  createdAt: string;
  requester: { name: string; department: string };
};

export function QueuePage() {
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [filter, setFilter] = useState('OPEN');
  const [error, setError] = useState('');

  useEffect(() => {
    api<{ tickets: TicketRow[] }>('/api/tickets').then((result) => setTickets(result.tickets)).catch((err: Error) => setError(err.message));
  }, []);

  const visible = tickets.filter((ticket) => {
    if (filter === 'OPEN') return ticket.status !== 'RESOLVED';
    if (filter === 'ALL') return true;
    return ticket.status === filter;
  });

  return (
    <div className="mx-auto max-w-6xl">
      <p className="text-xs tracking-[0.16em] text-muted">TECHNICIAN QUEUE</p>
      <div className="mt-1">
        <h1 className="font-serif text-4xl">Requests waiting for a person</h1>
        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          {['OPEN', 'ESCALATED', 'PENDING_REVIEW', 'IN_PROGRESS', 'RESOLVED', 'ALL'].map((item) => (
            <button key={item} className={`rounded-full px-3 py-1 ${filter === item ? 'bg-pine text-white' : 'bg-panel border border-line'}`} onClick={() => setFilter(item)} type="button">
              {pretty(item)}
            </button>
          ))}
        </div>
      </div>
      {error && <p className="mt-3 text-sm text-bad">{error}</p>}
      <Card className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-[#f7f1e7] text-xs tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Ticket</th>
              <th className="px-4 py-3 font-medium">Request</th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium">Priority</th>
              <th className="px-4 py-3 font-medium">Confidence</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((ticket) => (
              <tr key={ticket.id} className="border-t border-line">
                <td className="px-4 py-3">
                  <Link className="whitespace-nowrap font-medium text-copper" to={`/tickets/${ticket.id}`}>{ticketNo(ticket.number)}</Link>
                  <div className="text-xs text-muted">{when(ticket.createdAt)}</div>
                </td>
                <td className="px-4 py-3">
                  <div>{ticket.title}</div>
                  <div className="text-xs text-muted">{ticket.requester.name} · {ticket.plant}</div>
                </td>
                <td className="px-4 py-3">{pretty(ticket.category)}</td>
                <td className="px-4 py-3">{ticket.priority ? <Badge value={ticket.priority}>{ticket.priority}</Badge> : '—'}</td>
                <td className="px-4 py-3">{ticket.confidence == null ? '—' : ticket.confidence.toFixed(2)}</td>
                <td className="px-4 py-3"><Badge value={ticket.status}>{pretty(ticket.status)}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length === 0 && <p className="px-4 py-6 text-sm text-muted">Nothing in this view.</p>}
      </Card>
    </div>
  );
}
