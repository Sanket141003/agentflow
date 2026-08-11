'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

export default function LoginPage() {
  const router = useRouter();
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);

    if (mode === 'login') {
      const result = await signIn(email, password);
      if (result.error) {
        setError(result.error);
      } else {
        router.push('/dashboard');
      }
    } else {
      const result = await signUp(email, password, name);
      if (result.error) {
        setError(result.error);
      } else {
        setInfo('Account created! Check your email to verify, then sign in.');
        setMode('login');
      }
    }
    setLoading(false);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🤖</div>
          <h1 style={{ fontWeight: 800, fontSize: 28, color: 'var(--accent)', marginBottom: 4 }}>AgentFlow</h1>
          <p style={{ color: 'var(--muted)', fontSize: 14 }}>AI Agent Workflow Builder</p>
        </div>

        <div className="card">
          <div style={{ display: 'flex', gap: 0, marginBottom: 24, background: 'var(--bg)', borderRadius: 8, padding: 3 }}>
            {(['login', 'signup'] as const).map(m => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(null); setInfo(null); }}
                style={{
                  flex: 1, padding: '7px 0', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600,
                  background: mode === m ? 'var(--accent)' : 'transparent',
                  color: mode === m ? 'white' : 'var(--muted)',
                  transition: 'all 0.15s',
                }}
              >
                {m === 'login' ? 'Sign In' : 'Sign Up'}
              </button>
            ))}
          </div>

          <form onSubmit={submit}>
            {mode === 'signup' && (
              <div style={{ marginBottom: 14 }}>
                <label className="label">Display Name</label>
                <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Your name" />
              </div>
            )}
            <div style={{ marginBottom: 14 }}>
              <label className="label">Email</label>
              <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label className="label">Password</label>
              <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required minLength={8} />
            </div>

            {error && (
              <div style={{ marginBottom: 14, padding: '8px 12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, fontSize: 13, color: '#f87171' }}>
                {error}
              </div>
            )}
            {info && (
              <div style={{ marginBottom: 14, padding: '8px 12px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 6, fontSize: 13, color: '#34d399' }}>
                {info}
              </div>
            )}

            <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: '100%', justifyContent: 'center' }}>
              {loading ? 'Please wait…' : mode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', marginTop: 24, fontSize: 12, color: 'var(--muted)' }}>
          Powered by nhost + Hasura + GraphQL
        </p>
      </div>
    </div>
  );
}
