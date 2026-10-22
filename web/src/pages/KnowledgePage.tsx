import { useEffect, useState } from 'react';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardBody, CardHeader } from '../components/ui/card';
import { Field, Input, Select, TextArea } from '../components/ui/field';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { pretty } from '../lib/utils';

type Article = {
  id: string;
  title: string;
  body: string;
  category: string;
  system: string;
  sourceType: string;
  approved: boolean;
  qualityScore: number;
};

type Rule = {
  id: string;
  category: string;
  pattern: string;
  conditionText: string;
  suggestedAction: string;
  supportCount: number;
  status: string;
};

export function KnowledgePage() {
  const { user } = useAuth();
  const [articles, setArticles] = useState<Article[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [query, setQuery] = useState('');
  const [title, setTitle] = useState('');
  const [system, setSystem] = useState('SAP S/4HANA');
  const [category, setCategory] = useState('ERP');
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const manager = user?.role === 'MANAGER' || user?.role === 'ADMIN';

  function load() {
    api<{ articles: Article[] }>('/api/knowledge').then((result) => setArticles(result.articles)).catch((err: Error) => setError(err.message));
    api<{ rules: Rule[] }>('/api/rules').then((result) => setRules(result.rules)).catch(() => undefined);
  }

  useEffect(() => { load(); }, []);

  const visible = articles.filter((article) => `${article.title} ${article.category} ${article.system}`.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="mx-auto grid max-w-6xl gap-6">
      <header>
        <p className="text-xs tracking-[0.16em] text-muted">KNOWLEDGE</p>
        <h1 className="mt-1 font-serif text-4xl">Approved articles and learned patterns</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">Retrieval uses only approved records. A learned pattern from a partial fix stays out of search until a manager approves it.</p>
      </header>
      {error && <p className="text-sm text-bad">{error}</p>}
      <Input placeholder="Filter articles" value={query} onChange={(event) => setQuery(event.target.value)} />
      <div className="grid gap-3">
        {visible.map((article) => (
          <Card key={article.id}>
            <CardBody>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-medium">{article.title}</h2>
                <Badge value={article.sourceType}>{pretty(article.sourceType)}</Badge>
                <Badge>{pretty(article.category)}</Badge>
                {!article.approved && <Badge value="ESCALATED">Pending approval</Badge>}
              </div>
              <p className="mt-1 text-xs text-muted">{article.system} · quality {article.qualityScore.toFixed(2)}</p>
              <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-muted">{article.body}</p>
              {manager && (
                <Button className="mt-3" variant="outline" type="button" onClick={() => api(`/api/knowledge/${article.id}`, { method: 'PATCH', body: JSON.stringify({ approved: !article.approved }) }).then(load)}>
                  {article.approved ? 'Hold from retrieval' : 'Approve for retrieval'}
                </Button>
              )}
            </CardBody>
          </Card>
        ))}
      </div>

      {manager && (
        <Card>
          <CardHeader><h2 className="font-serif text-2xl">Add an approved article</h2></CardHeader>
          <CardBody>
            <form className="grid gap-3" onSubmit={(event) => {
              event.preventDefault();
              api('/api/knowledge', { method: 'POST', body: JSON.stringify({ title, body, category, system }) })
                .then(() => { setTitle(''); setBody(''); load(); })
                .catch((err: Error) => setError(err.message));
            }}>
              <Field label="Title"><Input value={title} onChange={(event) => setTitle(event.target.value)} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Category"><Select value={category} onChange={(event) => setCategory(event.target.value)}>{['ERP', 'MES', 'IDENTITY_ACCESS', 'NETWORK', 'HARDWARE', 'SOFTWARE', 'CYBERSECURITY'].map((item) => <option key={item}>{item}</option>)}</Select></Field>
                <Field label="System"><Input value={system} onChange={(event) => setSystem(event.target.value)} /></Field>
              </div>
              <Field label="Guidance, with numbered steps"><TextArea rows={5} value={body} onChange={(event) => setBody(event.target.value)} /></Field>
              <Button type="submit">Publish article</Button>
            </form>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader><h2 className="font-serif text-2xl">Candidate operational rules</h2></CardHeader>
        <CardBody className="space-y-4">
          {rules.length === 0 && <p className="text-sm text-muted">Rules appear after a technician records a resolution.</p>}
          {rules.map((rule) => (
            <div key={rule.id} className="border-t border-line pt-3 text-sm first:border-0 first:pt-0">
              <div className="flex items-center gap-2"><Badge>{rule.status}</Badge><span>{pretty(rule.category)}</span><span className="text-xs text-muted">support {rule.supportCount}</span></div>
              <p className="mt-1">{rule.conditionText}</p>
              <p className="text-muted">{rule.suggestedAction}</p>
              {manager && rule.status === 'CANDIDATE' && (
                <div className="mt-2 flex gap-2">
                  <Button type="button" onClick={() => api(`/api/rules/${rule.id}/decision`, { method: 'POST', body: JSON.stringify({ status: 'APPROVED' }) }).then(load)}>Approve</Button>
                  <Button type="button" variant="outline" onClick={() => api(`/api/rules/${rule.id}/decision`, { method: 'POST', body: JSON.stringify({ status: 'REJECTED' }) }).then(load)}>Reject</Button>
                </div>
              )}
            </div>
          ))}
        </CardBody>
      </Card>
    </div>
  );
}
