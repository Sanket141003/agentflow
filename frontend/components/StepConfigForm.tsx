'use client';
import { StepType } from '@/lib/types';

interface Props {
  stepType: StepType;
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}

export function StepConfigForm({ stepType, config, onChange }: Props) {
  const set = (key: string, value: unknown) => onChange({ ...config, [key]: value });

  const input = (label: string, key: string, placeholder?: string, multiline?: boolean) => (
    <div style={{ marginBottom: 10 }}>
      <label className="label">{label}</label>
      {multiline ? (
        <textarea
          className="input"
          rows={3}
          value={(config[key] as string) || ''}
          onChange={e => set(key, e.target.value)}
          placeholder={placeholder}
          style={{ resize: 'vertical' }}
        />
      ) : (
        <input className="input" value={(config[key] as string) || ''} onChange={e => set(key, e.target.value)} placeholder={placeholder} />
      )}
    </div>
  );

  if (stepType === 'llm_call') return (
    <div>
      {input('Model', 'model', 'llama3-8b-8192 (Groq default)')}
      {input('Prompt', 'prompt', 'Enter your prompt here...', true)}
    </div>
  );

  if (stepType === 'http_request') return (
    <div>
      {input('URL', 'url', 'https://api.example.com/endpoint')}
      <div style={{ marginBottom: 10 }}>
        <label className="label">Method</label>
        <select className="select" value={(config.method as string) || 'GET'} onChange={e => set('method', e.target.value)}>
          <option>GET</option><option>POST</option><option>PUT</option><option>PATCH</option><option>DELETE</option>
        </select>
      </div>
      {input('Headers (JSON)', 'headers', '{"Authorization": "Bearer token"}')}
    </div>
  );

  if (stepType === 'db_write') return (
    <div>
      {input('Table Name', 'table', 'my_table')}
      {input('Data Template (JSON)', 'data', '{"key": "value"}')}
    </div>
  );

  if (stepType === 'notify') return (
    <div>
      {input('Webhook URL (Slack/Discord)', 'webhook_url', 'https://hooks.slack.com/...')}
      {input('Message', 'message', 'Workflow step completed!', true)}
    </div>
  );

  if (stepType === 'conditional_branch') return (
    <div>
      {input('Condition (text match in previous output)', 'condition', 'success')}
      <div style={{ marginBottom: 10 }}>
        <label className="label">Stop on False Branch</label>
        <select className="select" value={config.stop_on_false ? 'true' : 'false'} onChange={e => set('stop_on_false', e.target.value === 'true')}>
          <option value="false">Continue</option>
          <option value="true">Stop workflow</option>
        </select>
      </div>
    </div>
  );

  if (stepType === 'approval_gate') return (
    <div>
      {input('Instructions for approver', 'instructions', 'Please review the previous output and approve to continue.')}
    </div>
  );

  return null;
}
