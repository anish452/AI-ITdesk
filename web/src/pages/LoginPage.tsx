import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Field, Input } from '../components/ui/field';
import { useAuth } from '../lib/auth';
import { homeFor } from '../components/Shell';

const demos = [
  ['Priya Shah', 'priya.shah@northline.example', 'Employee'],
  ['Sam Cole', 'sam.cole@northline.example', 'Employee'],
  ['James Okonkwo', 'james.okonkwo@northline.example', 'Technician'],
  ['Helena Voss', 'helena.voss@northline.example', 'Manager'],
  ['Alex Nguyen', 'admin@northline.example', 'Administrator'],
];

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('james.okonkwo@northline.example');
  const [password, setPassword] = useState('Northline#903');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={homeFor(user.role)} replace />;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const signedIn = await login(email, password);
      navigate(homeFor(signedIn.role));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_0.9fr]">
      <section className="flex flex-col justify-between bg-pine-deep px-10 py-10 text-[#f3ecdf]">
        <div>
          <p className="text-xs tracking-[0.18em] text-[#d7c4a8]">COMP903 · NORTHLINE MANUFACTURING</p>
          <h1 className="mt-6 max-w-xl font-serif text-5xl leading-tight">A multi-agent desk for manufacturing IT requests.</h1>
          <p className="mt-6 max-w-lg text-sm leading-6 text-[#d9d0c3]">
            Three agents classify the request, retrieve approved knowledge, and learn from the resolution the technician actually records. Nothing is changed on the plant, and no ticket closes itself.
          </p>
        </div>
        <ol className="grid max-w-lg gap-3 text-sm">
          <li>1. Classification agent predicts category, urgency, and priority.</li>
          <li>2. Recommendation agent retrieves evidence with pgvector and drafts steps.</li>
          <li>3. Learning agent stores anonymised patterns without fine-tuning a model.</li>
        </ol>
      </section>
      <section className="flex items-center px-8 py-10">
        <form onSubmit={submit} className="mx-auto w-full max-w-md space-y-4">
          <h2 className="font-serif text-3xl">Sign in</h2>
          <p className="text-sm text-muted">Demonstration password for every account: Northline#903</p>
          <Field label="Email">
            <Input value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" />
          </Field>
          <Field label="Password">
            <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" />
          </Field>
          {error && <p className="text-sm text-bad">{error}</p>}
          <Button type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Enter the desk'}</Button>
          <div className="grid gap-2 pt-2">
            {demos.map(([name, address, role]) => (
              <button
                key={address}
                type="button"
                className="flex items-center justify-between rounded-md border border-line bg-panel px-3 py-2 text-left text-sm hover:border-copper"
                onClick={() => { setEmail(address); setPassword('Northline#903'); }}
              >
                <span>{name}</span>
                <span className="text-xs text-muted">{role}</span>
              </button>
            ))}
          </div>
        </form>
      </section>
    </div>
  );
}
