'use client';
import { useState } from 'react';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { WorkflowStep, WorkflowTrigger, StepType, TriggerType, STEP_TYPE_LABELS, STEP_TYPE_COLORS, OWNER_ONLY_STEPS, OWNER_ONLY_TRIGGERS, OrgRole } from '@/lib/types';
import { StepConfigForm } from './StepConfigForm';

interface Props {
  steps: WorkflowStep[];
  trigger: WorkflowTrigger | null;
  onChange: (steps: WorkflowStep[], trigger: WorkflowTrigger | null) => void;
  role: OrgRole;
}

function SortableStep({ step, onEdit, onDelete, isOwner }: {
  step: WorkflowStep;
  onEdit: () => void;
  onDelete: () => void;
  isOwner: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: step.id || step.step_order.toString() });
  const color = STEP_TYPE_COLORS[step.step_type];

  return (
    <div ref={setNodeRef} style={{
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
      background: 'var(--bg)',
      border: `1px solid ${color}44`,
      borderLeft: `3px solid ${color}`,
      borderRadius: 8,
      padding: '12px 14px',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      marginBottom: 8,
    }}>
      <div {...attributes} {...listeners} style={{ cursor: 'grab', color: 'var(--muted)', userSelect: 'none' }}>⠿</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{step.name}</div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
          {STEP_TYPE_LABELS[step.step_type]}
          {OWNER_ONLY_STEPS.includes(step.step_type) && <span style={{ color: '#f59e0b', marginLeft: 6 }}>⚠ owner only</span>}
        </div>
      </div>
      <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={onEdit}>Edit</button>
      <button className="btn btn-danger" style={{ padding: '4px 10px', fontSize: 12 }} onClick={onDelete}>✕</button>
    </div>
  );
}

export function WorkflowBuilder({ steps, trigger, onChange, role }: Props) {
  const [editingStep, setEditingStep] = useState<WorkflowStep | null>(null);
  const [showAddStep, setShowAddStep] = useState(false);
  const [newStepType, setNewStepType] = useState<StepType>('llm_call');
  const [newStepName, setNewStepName] = useState('');
  const [newStepConfig, setNewStepConfig] = useState<Record<string, unknown>>({});
  const isOwner = role === 'owner';

  const sensors = useSensors(useSensor(PointerSensor));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = steps.findIndex(s => (s.id || s.step_order.toString()) === active.id);
    const newIndex = steps.findIndex(s => (s.id || s.step_order.toString()) === over.id);
    const reordered = arrayMove(steps, oldIndex, newIndex).map((s, i) => ({ ...s, step_order: i + 1 }));
    onChange(reordered, trigger);
  };

  const addStep = () => {
    if (!newStepName.trim()) return;
    if (OWNER_ONLY_STEPS.includes(newStepType) && !isOwner) {
      alert('Only owners can add this step type.');
      return;
    }
    const newStep: WorkflowStep = {
      id: `new-${Date.now()}`,
      step_order: steps.length + 1,
      name: newStepName,
      step_type: newStepType,
      config: newStepConfig,
    };
    onChange([...steps, newStep], trigger);
    setNewStepName('');
    setNewStepConfig({});
    setShowAddStep(false);
  };

  const saveEdit = () => {
    if (!editingStep) return;
    const updated = steps.map(s => (s.id === editingStep.id || s.step_order === editingStep.step_order) ? editingStep : s);
    onChange(updated, trigger);
    setEditingStep(null);
  };

  const deleteStep = (stepId: string) => {
    const filtered = steps.filter(s => s.id !== stepId).map((s, i) => ({ ...s, step_order: i + 1 }));
    onChange(filtered, trigger);
  };

  return (
    <div>
      {/* Trigger */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          ⚡ Trigger
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label className="label">Trigger Type</label>
            <select
              className="select"
              value={trigger?.trigger_type || 'manual'}
              onChange={e => {
                const tt = e.target.value as TriggerType;
                if (OWNER_ONLY_TRIGGERS.includes(tt) && !isOwner) { alert('Only owners can use this trigger type.'); return; }
                onChange(steps, { id: trigger?.id || '', trigger_type: tt, config: {}, is_active: true });
              }}
            >
              <option value="manual">Manual</option>
              <option value="webhook">Webhook</option>
              <option value="scheduled">Scheduled</option>
              <option value="database_event">Database Event</option>
            </select>
            {OWNER_ONLY_TRIGGERS.includes(trigger?.trigger_type || 'manual') && (
              <div style={{ fontSize: 12, color: '#f59e0b', marginTop: 4 }}>⚠ Owner only trigger</div>
            )}
          </div>
          {trigger?.trigger_type === 'webhook' && (
            <div style={{ flex: 2, minWidth: 250 }}>
              <label className="label">Webhook Secret</label>
              <input className="input" placeholder="Set a secret for the webhook" value={(trigger.config.secret as string) || ''} onChange={e => onChange(steps, { ...trigger, config: { ...trigger.config, secret: e.target.value } })} />
            </div>
          )}
          {trigger?.trigger_type === 'scheduled' && (
            <div style={{ flex: 2, minWidth: 250 }}>
              <label className="label">Cron Expression</label>
              <input className="input" placeholder="0 * * * * (every hour)" value={(trigger.config.cron as string) || ''} onChange={e => onChange(steps, { ...trigger, config: { ...trigger.config, cron: e.target.value } })} />
            </div>
          )}
        </div>
      </div>

      {/* Steps */}
      <div className="card">
        <div style={{ fontWeight: 600, marginBottom: 12 }}>Steps ({steps.length})</div>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={steps.map(s => s.id || s.step_order.toString())} strategy={verticalListSortingStrategy}>
            {steps.map(step => (
              <SortableStep
                key={step.id || step.step_order}
                step={step}
                isOwner={isOwner}
                onEdit={() => setEditingStep({ ...step })}
                onDelete={() => deleteStep(step.id!)}
              />
            ))}
          </SortableContext>
        </DndContext>

        {steps.length === 0 && (
          <div style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)', fontSize: 14 }}>
            No steps yet. Add your first step below.
          </div>
        )}

        {showAddStep ? (
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 16, marginTop: 8 }}>
            <div style={{ marginBottom: 10 }}>
              <label className="label">Step Name</label>
              <input className="input" value={newStepName} onChange={e => setNewStepName(e.target.value)} placeholder="My step name" />
            </div>
            <div style={{ marginBottom: 10 }}>
              <label className="label">Step Type</label>
              <select className="select" value={newStepType} onChange={e => { setNewStepType(e.target.value as StepType); setNewStepConfig({}); }}>
                {(Object.keys(STEP_TYPE_LABELS) as StepType[]).map(t => (
                  <option key={t} value={t} disabled={OWNER_ONLY_STEPS.includes(t) && !isOwner}>
                    {STEP_TYPE_LABELS[t]}{OWNER_ONLY_STEPS.includes(t) ? ' (owner only)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <StepConfigForm stepType={newStepType} config={newStepConfig} onChange={setNewStepConfig} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" onClick={addStep}>Add Step</button>
              <button className="btn btn-secondary" onClick={() => setShowAddStep(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <button className="btn btn-secondary" style={{ width: '100%', marginTop: 8, justifyContent: 'center' }} onClick={() => setShowAddStep(true)}>
            + Add Step
          </button>
        )}
      </div>

      {/* Edit modal */}
      {editingStep && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div className="card" style={{ width: 500, maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 16 }}>Edit Step</div>
            <div style={{ marginBottom: 10 }}>
              <label className="label">Step Name</label>
              <input className="input" value={editingStep.name} onChange={e => setEditingStep({ ...editingStep, name: e.target.value })} />
            </div>
            <div style={{ marginBottom: 10 }}>
              <label className="label">Step Type</label>
              <select className="select" value={editingStep.step_type} onChange={e => setEditingStep({ ...editingStep, step_type: e.target.value as StepType, config: {} })}>
                {(Object.keys(STEP_TYPE_LABELS) as StepType[]).map(t => (
                  <option key={t} value={t}>{STEP_TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>
            <StepConfigForm stepType={editingStep.step_type} config={editingStep.config} onChange={cfg => setEditingStep({ ...editingStep, config: cfg })} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" onClick={saveEdit}>Save</button>
              <button className="btn btn-secondary" onClick={() => setEditingStep(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
