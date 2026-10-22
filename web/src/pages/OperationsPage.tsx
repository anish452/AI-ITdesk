import { useEffect, useState } from 'react';
import { Button } from '../components/ui/button';
import { Card, CardBody, CardHeader } from '../components/ui/card';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { percent, pretty, when } from '../lib/utils';

type Dashboard = {
  counts: { total: number; open: number; escalated: number; pending: number; resolved: number };
  acceptanceRate: number | null;
  averageUsefulness: number | null;
  averageConfidence: number | null;
  byCategory: Record<string, number>;
  threshold: number;
  learning: { id: string; summary: string; recordsAdded: number; createdAt: string }[];
  languageModel: string;
};

type Run = {
  id: string;
  label: string;
  durationMs: number;
  createdAt: string;
  metrics: {
    sampleSize: { train: number; validation: number; test: number };
    classification: {
      agent: { macroF1: number; priorityAccuracy: number; latencyMs: number };
      machineLearning: { macroF1: number; priorityAccuracy: number; latencyMs: number };
      monolithic: { macroF1: number; priorityAccuracy: number; latencyMs: number };
    };
    retrieval: { ragHitAt5: number; staticHitAt5: number };
    recommendation: { ragUsefulness: number; staticUsefulness: number; monolithicUsefulness: number };
    learning: { hitAt5Before: number; hitAt5After: number; usefulnessBefore: number; usefulnessAfter: number; recordsAdded: number; heldOutQueries: number };
    efficiency: { classificationLatencyMs: number; endToEndMs: number };
  };
  hypotheses: { id: string; statement: string; supported: boolean; note: string }[];
};

export function OperationsPage() {
  const { user } = useAuth();
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const canRun = user?.role === 'MANAGER' || user?.role === 'ADMIN';

  function load() {
    api<{ } & Dashboard>('/api/dashboard').then(setDashboard).catch((err: Error) => setError(err.message));
    api<{ runs: Run[] }>('/api/evaluation').then((result) => setRuns(result.runs)).catch(() => undefined);
  }

  useEffect(() => { load(); }, []);

  async function runEvaluation() {
    setBusy(true);
    setError('');
    try {
      await api('/api/evaluation', { method: 'POST' });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Evaluation failed');
    } finally {
      setBusy(false);
    }
  }

  const latest = runs[0];
  const maxCategory = Math.max(1, ...Object.values(dashboard?.byCategory ?? { x: 1 }));

  return (
    <div className="mx-auto grid max-w-6xl gap-6">
      <header>
        <p className="text-xs tracking-[0.16em] text-muted">OPERATIONS</p>
        <h1 className="mt-1 font-serif text-4xl">Desk activity and experiment</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
          Live tickets are the working desk. The experiment compares the three-agent design with naive Bayes, a static keyword search, and a monolithic prompt on the same synthetic test set.
          {dashboard ? ` Recommendations are produced by the ${dashboard.languageModel === 'external' ? 'configured language model' : 'local extractive generator'}.` : ''}
        </p>
        {canRun && <Button className="mt-4" type="button" onClick={runEvaluation} disabled={busy}>{busy ? 'Running…' : 'Run experiment'}</Button>}
      </header>
      {error && <p className="text-sm text-bad">{error}</p>}
      {dashboard && (
        <div className="grid gap-3 sm:grid-cols-4">
          {[
            ['Open', dashboard.counts.open],
            ['Escalated', dashboard.counts.escalated],
            ['Awaiting review', dashboard.counts.pending],
            ['Resolved', dashboard.counts.resolved],
          ].map(([label, value]) => (
            <Card key={String(label)}><CardBody><div className="text-xs text-muted">{label}</div><div className="mt-1 font-serif text-3xl">{value}</div></CardBody></Card>
          ))}
        </div>
      )}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader><h2 className="font-serif text-2xl">Categories on the desk</h2></CardHeader>
          <CardBody className="space-y-2">
            {Object.entries(dashboard?.byCategory ?? {}).map(([category, count]) => (
              <div key={category} className="grid grid-cols-[140px_1fr_32px] items-center gap-2 text-sm">
                <span>{pretty(category)}</span>
                <div className="h-2 rounded-full bg-[#efe8dc]"><div className="h-2 rounded-full bg-copper" style={{ width: `${(count / maxCategory) * 100}%` }} /></div>
                <span className="text-right">{count}</span>
              </div>
            ))}
            <p className="pt-2 text-xs text-muted">Mean confidence {dashboard?.averageConfidence == null ? '—' : dashboard.averageConfidence.toFixed(2)} · acceptance {percent(dashboard?.acceptanceRate)} · mean usefulness {dashboard?.averageUsefulness == null ? '—' : dashboard.averageUsefulness.toFixed(1)} / 5 · escalation threshold {dashboard?.threshold}</p>
          </CardBody>
        </Card>
        <Card>
          <CardHeader><h2 className="font-serif text-2xl">Learning reports</h2></CardHeader>
          <CardBody className="space-y-3 text-sm">
            {dashboard?.learning.length === 0 && <p className="text-muted">No resolved tickets have been learned from yet.</p>}
            {dashboard?.learning.map((report) => (
              <div key={report.id}>
                <div className="text-xs text-muted">{when(report.createdAt)} · {report.recordsAdded} record added</div>
                <p>{report.summary}</p>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>

      {latest && (
        <Card>
          <CardHeader>
            <h2 className="font-serif text-2xl">Latest comparison</h2>
            <p className="text-xs text-muted">{latest.label} · train {latest.metrics.sampleSize.train} · test {latest.metrics.sampleSize.test} · {latest.durationMs} ms · {when(latest.createdAt)}</p>
          </CardHeader>
          <CardBody className="space-y-4">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted">
                <tr><th className="py-2">Method</th><th>Category macro-F1</th><th>Priority accuracy</th><th>Hit@5</th><th>Usefulness</th></tr>
              </thead>
              <tbody>
                <tr className="border-t border-line"><td className="py-2">Classification / RAG agents</td><td>{latest.metrics.classification.agent.macroF1}</td><td>{percent(latest.metrics.classification.agent.priorityAccuracy)}</td><td>{percent(latest.metrics.retrieval.ragHitAt5)}</td><td>{latest.metrics.recommendation.ragUsefulness.toFixed(2)}</td></tr>
                <tr className="border-t border-line"><td className="py-2">Naive Bayes + static search</td><td>{latest.metrics.classification.machineLearning.macroF1}</td><td>{percent(latest.metrics.classification.machineLearning.priorityAccuracy)}</td><td>{percent(latest.metrics.retrieval.staticHitAt5)}</td><td>{latest.metrics.recommendation.staticUsefulness.toFixed(2)}</td></tr>
                <tr className="border-t border-line"><td className="py-2">Monolithic prompt</td><td>{latest.metrics.classification.monolithic.macroF1}</td><td>{percent(latest.metrics.classification.monolithic.priorityAccuracy)}</td><td>—</td><td>{latest.metrics.recommendation.monolithicUsefulness.toFixed(2)}</td></tr>
              </tbody>
            </table>
            <p className="text-xs text-muted">Hit@5 is the share of test requests whose relevant article appears in the top five. End-to-end local processing averaged {latest.metrics.efficiency.endToEndMs} ms. Learning on {latest.metrics.learning.heldOutQueries} held-out queries moved Hit@5 from {percent(latest.metrics.learning.hitAt5Before)} to {percent(latest.metrics.learning.hitAt5After)} after {latest.metrics.learning.recordsAdded} knowledge records, without changing model weights.</p>
            <div className="grid gap-3">
              {latest.hypotheses.map((item) => (
                <div key={item.id} className="rounded-lg border border-line px-3 py-3">
                  <div className="text-sm font-medium">{item.id} · {item.supported ? 'Supported on this run' : 'Not supported on this run'}</div>
                  <p className="mt-1 text-sm text-muted">{item.statement}</p>
                  <p className="mt-1 text-xs">{item.note}</p>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
