import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardBody, CardHeader } from '../components/ui/card';
import { Field, Select, TextArea } from '../components/ui/field';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { pretty, ticketNo, when } from '../lib/utils';

type Hit = { id: string; title: string; score: number; sourceType: string };
type Ticket = {
  id: string;
  number: number;
  title: string;
  description: string;
  status: string;
  category: string | null;
  urgency: string | null;
  priority: string | null;
  confidence: number | null;
  escalated: boolean;
  escalationReason: string | null;
  plant: string;
  department: string;
  affectedSystem: string;
  resolution: string | null;
  outcome: string | null;
  createdAt: string;
  requester: { name: string; department: string; plant: string };
  assignedTo: { name: string } | null;
  classifications: { id: string; agent: string; category: string; urgency: string; priority: string; confidence: number; rationale: string; latencyMs: number }[];
  recommendations: { id: string; problem: string; steps: string[]; references: Hit[]; confidence: number; warning: string | null; generator: string; grounded: boolean; usefulness: number | null; accepted: boolean | null; technicianNote: string | null }[];
  retrievals: { id: string; method: string; latencyMs: number; hits: Hit[] }[];
  messages: { id: string; fromAgent: string; toAgent: string; type: string; body: unknown; createdAt: string }[];
};

const categories = ['ERP', 'MES', 'IDENTITY_ACCESS', 'NETWORK', 'HARDWARE', 'SOFTWARE', 'CYBERSECURITY'];

export function TicketPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [error, setError] = useState('');
  const [category, setCategory] = useState('ERP');
  const [urgency, setUrgency] = useState('MEDIUM');
  const [priority, setPriority] = useState('P3');
  const [usefulness, setUsefulness] = useState(4);
  const [note, setNote] = useState('');
  const [resolution, setResolution] = useState('');
  const [outcome, setOutcome] = useState('SUCCESS');
  const [showMessages, setShowMessages] = useState(false);
  const staff = user && user.role !== 'EMPLOYEE';

  function load() {
    if (!id) return;
    api<{ ticket: Ticket }>(`/api/tickets/${id}`)
      .then((result) => {
        setTicket(result.ticket);
        if (result.ticket.category) setCategory(result.ticket.category);
        if (result.ticket.urgency) setUrgency(result.ticket.urgency);
        if (result.ticket.priority) setPriority(result.ticket.priority);
      })
      .catch((err: Error) => setError(err.message));
  }

  useEffect(() => { load(); }, [id]);

  useEffect(() => {
    if (!ticket || !['SUBMITTED', 'CLASSIFYING', 'RECOMMENDING'].includes(ticket.status)) return;
    const timer = window.setInterval(load, 1200);
    return () => window.clearInterval(timer);
  }, [ticket?.status, id]);

  async function act(path: string, body?: unknown) {
    setError('');
    try {
      await api(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    }
  }

  if (!ticket) return <p className="text-sm text-muted">{error || 'Loading the ticket…'}</p>;
  const latest = ticket.classifications[0];
  const recommendation = ticket.recommendations[0];
  const evidence = ticket.retrievals[0];

  return (
    <div className="mx-auto grid max-w-6xl gap-5">
      <div>
        <Link className="text-sm text-copper" to={staff ? '/queue' : '/'}>Back</Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-serif text-4xl">{ticketNo(ticket.number)}</h1>
          <Badge value={ticket.status}>{pretty(ticket.status)}</Badge>
          {ticket.priority && <Badge value={ticket.priority}>{ticket.priority}</Badge>}
        </div>
        <p className="mt-2 max-w-3xl text-lg">{ticket.title}</p>
      </div>
      {error && <p className="text-sm text-bad">{error}</p>}
      {ticket.escalated && <div className="rounded-lg border border-[#e7c3c3] bg-[#fbf1f1] px-4 py-3 text-sm text-bad">{ticket.escalationReason}</div>}
      {['SUBMITTED', 'CLASSIFYING', 'RECOMMENDING'].includes(ticket.status) && <p className="text-sm text-muted">The agents are reading this request…</p>}

      <div className="grid items-start gap-5 lg:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader><h2 className="font-serif text-2xl">Request</h2></CardHeader>
          <CardBody className="space-y-3 text-sm leading-6">
            <p>{ticket.description}</p>
            <dl className="grid grid-cols-2 gap-2 text-xs text-muted">
              <div>Requester<br /><span className="text-sm text-ink">{ticket.requester.name}</span></div>
              <div>Plant<br /><span className="text-sm text-ink">{ticket.plant}</span></div>
              <div>Department<br /><span className="text-sm text-ink">{ticket.department}</span></div>
              <div>System<br /><span className="text-sm text-ink">{ticket.affectedSystem}</span></div>
              <div>Opened<br /><span className="text-sm text-ink">{when(ticket.createdAt)}</span></div>
              <div>Assignee<br /><span className="text-sm text-ink">{ticket.assignedTo?.name ?? 'Unassigned'}</span></div>
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader><h2 className="font-serif text-2xl">Classification agent</h2></CardHeader>
          <CardBody className="space-y-3 text-sm">
            {!latest && <p className="text-muted">Waiting for the classification agent.</p>}
            {latest && (
              <>
                <div className="flex flex-wrap gap-2">
                  <Badge>{pretty(latest.category)}</Badge>
                  <Badge value={latest.urgency}>{pretty(latest.urgency)}</Badge>
                  <Badge value={latest.priority}>{latest.priority}</Badge>
                  <span className="text-xs text-muted">confidence {latest.confidence.toFixed(2)} · {latest.latencyMs} ms · {latest.agent}</span>
                </div>
                <p className="leading-6 text-muted">{latest.rationale}</p>
              </>
            )}
            {staff && (
              <div className="grid gap-2 border-t border-line pt-3">
                <div className="grid grid-cols-3 gap-2">
                  <Field label="Category"><Select value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</Select></Field>
                  <Field label="Urgency"><Select value={urgency} onChange={(event) => setUrgency(event.target.value)}>{['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((item) => <option key={item}>{item}</option>)}</Select></Field>
                  <Field label="Priority"><Select value={priority} onChange={(event) => setPriority(event.target.value)}>{['P4', 'P3', 'P2', 'P1'].map((item) => <option key={item}>{item}</option>)}</Select></Field>
                </div>
                <Button type="button" variant="outline" onClick={() => api(`/api/tickets/${ticket.id}/classification`, { method: 'PATCH', body: JSON.stringify({ category, urgency, priority }) }).then(load).catch((err: Error) => setError(err.message))}>
                  Confirm classification
                </Button>
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader><h2 className="font-serif text-2xl">Retrieved evidence</h2></CardHeader>
          <CardBody className="space-y-3 text-sm">
            {!evidence && <p className="text-muted">No retrieval yet.</p>}
            {evidence?.hits.map((hit) => (
              <div key={hit.id} className="rounded-md border border-line px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">{hit.title}</span>
                  <span className="text-xs text-muted">{Number(hit.score).toFixed(2)}</span>
                </div>
                <div className="text-xs text-muted">{pretty(hit.sourceType)}</div>
              </div>
            ))}
            {evidence && <p className="text-xs text-muted">{evidence.method} · {evidence.latencyMs} ms</p>}
          </CardBody>
        </Card>

        <Card>
          <CardHeader><h2 className="font-serif text-2xl">Recommendation</h2></CardHeader>
          <CardBody className="space-y-3 text-sm leading-6">
            {!recommendation && <p className="text-muted">The recommendation agent has not finished.</p>}
            {recommendation && (
              <>
                <p>{recommendation.problem}</p>
                <ol className="list-decimal space-y-1 pl-5">
                  {recommendation.steps.map((step) => <li key={step}>{step}</li>)}
                </ol>
                {recommendation.warning && <p className="rounded-md bg-[#f8ead4] px-3 py-2 text-warn">{recommendation.warning}</p>}
                <p className="text-xs text-muted">Generator {recommendation.generator}. Confidence {recommendation.confidence.toFixed(2)}. A technician reviews this before any action. The desk does not change infrastructure.</p>
                {recommendation.accepted != null && <p>Review: {recommendation.accepted ? 'accepted' : 'rejected'} · usefulness {recommendation.usefulness}/5. {recommendation.technicianNote}</p>}
              </>
            )}
            {staff && recommendation && ticket.status !== 'RESOLVED' && (
              <div className="space-y-2 border-t border-line pt-3">
                <Field label="Usefulness (1–5)">
                  <Select value={String(usefulness)} onChange={(event) => setUsefulness(Number(event.target.value))}>
                    {[1, 2, 3, 4, 5].map((score) => <option key={score} value={score}>{score}</option>)}
                  </Select>
                </Field>
                <Field label="Note"><TextArea rows={2} value={note} onChange={(event) => setNote(event.target.value)} /></Field>
                <div className="flex gap-2">
                  <Button type="button" onClick={() => act(`/api/tickets/${ticket.id}/feedback`, { usefulness, accepted: true, note })}>Accept</Button>
                  <Button type="button" variant="outline" onClick={() => act(`/api/tickets/${ticket.id}/feedback`, { usefulness, accepted: false, note })}>Reject</Button>
                  <Button type="button" variant="ghost" onClick={() => act(`/api/tickets/${ticket.id}/recommend`)}>Rebuild</Button>
                </div>
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {staff && ticket.status !== 'RESOLVED' && (
        <Card>
          <CardHeader><h2 className="font-serif text-2xl">Resolution</h2></CardHeader>
          <CardBody className="space-y-3">
            <p className="text-sm text-muted">Write what you did. The learning agent can reuse a successful note only after you record it, and only in anonymised form.</p>
            <Field label="What was done">
              <TextArea rows={4} value={resolution} onChange={(event) => setResolution(event.target.value)} />
            </Field>
            <Field label="Outcome">
              <Select value={outcome} onChange={(event) => setOutcome(event.target.value)}>
                <option value="SUCCESS">Success</option>
                <option value="PARTIAL">Partial</option>
                <option value="FAILED">Failed</option>
              </Select>
            </Field>
            <Button type="button" variant="pine" onClick={() => act(`/api/tickets/${ticket.id}/resolve`, { resolution, outcome })}>Record resolution</Button>
          </CardBody>
        </Card>
      )}

      {ticket.resolution && (
        <Card>
          <CardHeader><h2 className="font-serif text-2xl">Recorded outcome</h2></CardHeader>
          <CardBody className="text-sm leading-6">
            <Badge>{ticket.outcome ?? 'Recorded'}</Badge>
            <p className="mt-3">{ticket.resolution}</p>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader className="flex items-center justify-between">
          <h2 className="font-serif text-2xl">Agent messages</h2>
          <Button variant="ghost" type="button" onClick={() => setShowMessages((open) => !open)}>{showMessages ? 'Hide' : 'Show JSON'}</Button>
        </CardHeader>
        {showMessages && (
          <CardBody className="space-y-3">
            {ticket.messages.map((message) => (
              <pre key={message.id} className="overflow-auto rounded-md bg-pine-deep p-3 text-xs leading-5 text-[#f3ecdf]">
                {message.fromAgent} → {message.toAgent} · {message.type}{'\n'}
                {JSON.stringify(message.body, null, 2)}
              </pre>
            ))}
          </CardBody>
        )}
      </Card>
    </div>
  );
}
