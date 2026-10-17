import { useEffect, useState } from 'react';
import { adminApi } from '../../services/api';
import { realtime } from '../../services/realtime';
import { IconCheck, IconClipboard, IconPlus, IconTrash, IconX } from '../../components/Icons';
import { EmptyState, SectionHeader, SkeletonList } from '../../components/Ui';

const BLANK = {
  code: '',
  stage_name: '',
  location: '',
  description: '',
  estimated_duration_days: 1,
  requires_payment: false,
  payment_amount: '',
};

/**
 * Section (clearance stage) configuration.
 *
 * The workflow is data, so this page is where the university's actual process
 * gets encoded: which sections exist, what order they sit in, and which ones
 * gate others. Deactivating is offered alongside deleting because a section with
 * approval history must not lose it — the server enforces that distinction and
 * this page surfaces which option applies per row.
 */
export default function ManageSections() {
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(BLANK);
  const [prereqFor, setPrereqFor] = useState(null);
  const [prereqPick, setPrereqPick] = useState([]);

  useEffect(() => {
    load();
    const unsubStages = realtime.on('stages:update', () => load());
    return () => unsubStages();
  }, []);

  const load = async () => {
    try {
      setLoading(true);
      setSections(await adminApi.sections());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  /** Every mutation funnels through here so feedback and reloading stay uniform. */
  const run = async (action, fn) => {
    setError('');
    setNotice('');
    try {
      setBusy(true);
      const result = await fn();
      setNotice(result?.message || `${action} done.`);
      await load();
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    const payload = {
      ...form,
      estimated_duration_days: Number(form.estimated_duration_days) || 1,
      payment_amount: form.requires_payment ? Number(form.payment_amount) || 0 : 0,
    };
    const ok = await run('Section created', () => adminApi.createSection(payload));
    if (ok) {
      setForm(BLANK);
      setShowAdd(false);
    }
  };

  const startEdit = (section) => {
    setEditingId(section.id);
    setEditForm({
      code: section.code,
      stage_name: section.stage_name,
      location: section.location || '',
      description: section.description || '',
      estimated_duration_days: section.estimated_duration_days,
      requires_payment: section.requires_payment,
      payment_amount: section.payment_amount || '',
    });
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    const payload = {
      stage_name: editForm.stage_name,
      location: editForm.location,
      description: editForm.description,
      estimated_duration_days: Number(editForm.estimated_duration_days) || 1,
      requires_payment: editForm.requires_payment,
      payment_amount: editForm.requires_payment ? Number(editForm.payment_amount) || 0 : 0,
    };
    const ok = await run('Section updated', () => adminApi.updateSection(editingId, payload));
    if (ok) setEditingId(null);
  };

  const toggleActive = (section) => {
    const verb = section.is_active ? 'remove from the workflow' : 'reactivate';
    if (!window.confirm(`Really ${verb} "${section.stage_name}"?`)) return;
    return run('Section updated', () => adminApi.setSectionStatus(section.id, !section.is_active));
  };

  const remove = (section) => {
    if (!window.confirm(`Permanently delete "${section.stage_name}"? This cannot be undone.`)) return;
    return run('Section deleted', () => adminApi.deleteSection(section.id));
  };

  /** Swap a section with its neighbour and persist the whole order. */
  const move = (index, delta) => {
    const next = [...sections];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setSections(next); // optimistic: the list re-renders before the round trip
    return run('Order updated', () => adminApi.reorderSections(next.map((s) => s.id)));
  };

  const openPrereqs = (section) => {
    setPrereqFor(section);
    setPrereqPick(section.prerequisite_ids);
  };

  const savePrereqs = async () => {
    const ok = await run('Prerequisites saved', () => adminApi.setPrerequisites(prereqFor.id, prereqPick));
    if (ok) setPrereqFor(null);
  };

  if (loading) {
    return (
      <div className="card">
        <SkeletonList rows={5} />
      </div>
    );
  }

  const nameOf = (id) => sections.find((s) => s.id === id)?.stage_name || `#${id}`;
  const active = sections.filter((s) => s.is_active);

  return (
    <div className="stack">
      {error && <div className="error">{error}</div>}
      {notice && <div className="notice">{notice}</div>}

      <div className="card">
        <SectionHeader
          title="Clearance sections"
          description={`${active.length} active of ${sections.length} — students must clear these in order`}
          action={
            <button className="btn btn-primary btn-sm" onClick={() => setShowAdd((v) => !v)} type="button">
              <IconPlus width={15} height={15} />
              {showAdd ? 'Cancel' : 'Add section'}
            </button>
          }
        />

        {showAdd && (
          <form className="inline-form" onSubmit={handleCreate}>
            <p className="inline-form-hint">
              New sections are appended to the end of the workflow and added to every existing student's
              clearance immediately.
            </p>

            <div className="form-row">
              <div className="form-group">
                <label>Section name</label>
                <input
                  value={form.stage_name}
                  onChange={(e) => setForm({ ...form, stage_name: e.target.value })}
                  placeholder="e.g. Works & Maintenance Clearance"
                  required
                />
              </div>
              <div className="form-group">
                <label>Short code</label>
                <input
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  placeholder="e.g. works"
                  required
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Where students go</label>
                <input
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  placeholder="e.g. Works Department, Ground Floor"
                />
              </div>
              <div className="form-group">
                <label>Expected duration (days)</label>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={form.estimated_duration_days}
                  onChange={(e) => setForm({ ...form, estimated_duration_days: e.target.value })}
                />
              </div>
            </div>

            <div className="form-group">
              <label>What this section checks (optional)</label>
              <input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Shown to students on their clearance page"
              />
            </div>

            <label className="check-row">
              <input
                type="checkbox"
                checked={form.requires_payment}
                onChange={(e) => setForm({ ...form, requires_payment: e.target.checked })}
              />
              <span>This section requires a payment before submission</span>
            </label>

            {form.requires_payment && (
              <div className="form-group">
                <label>Amount (₦)</label>
                <input
                  type="number"
                  min={0}
                  value={form.payment_amount}
                  onChange={(e) => setForm({ ...form, payment_amount: e.target.value })}
                  placeholder="1000"
                />
              </div>
            )}

            <div className="form-actions">
              <button className="btn btn-primary btn-sm" type="submit" disabled={busy}>
                {busy ? 'Adding…' : 'Add section'}
              </button>
              <button className="btn btn-secondary btn-sm" type="button" onClick={() => setShowAdd(false)}>
                Cancel
              </button>
            </div>
          </form>
        )}

        {sections.length === 0 ? (
          <EmptyState
            icon={IconClipboard}
            title="No sections yet"
            message="Add the first clearance section to define the workflow."
          />
        ) : (
          <ul className="req-list">
            {sections.map((section, index) => (
              <li key={section.id} className={`req-item${section.is_active ? '' : ' section-inactive'}`}>
                {editingId === section.id ? (
                  <form onSubmit={handleUpdate}>
                    <div className="form-row">
                      <div className="form-group">
                        <label>Section name</label>
                        <input
                          value={editForm.stage_name}
                          onChange={(e) => setEditForm({ ...editForm, stage_name: e.target.value })}
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label>Expected duration (days)</label>
                        <input
                          type="number"
                          min={1}
                          max={60}
                          value={editForm.estimated_duration_days}
                          onChange={(e) => setEditForm({ ...editForm, estimated_duration_days: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="form-group">
                      <label>Where students go</label>
                      <input
                        value={editForm.location}
                        onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label>What this section checks</label>
                      <input
                        value={editForm.description}
                        onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                      />
                    </div>
                    <label className="check-row">
                      <input
                        type="checkbox"
                        checked={editForm.requires_payment}
                        onChange={(e) => setEditForm({ ...editForm, requires_payment: e.target.checked })}
                      />
                      <span>Requires a payment before submission</span>
                    </label>
                    {editForm.requires_payment && (
                      <div className="form-group">
                        <label>Amount (₦)</label>
                        <input
                          type="number"
                          min={0}
                          value={editForm.payment_amount}
                          onChange={(e) => setEditForm({ ...editForm, payment_amount: e.target.value })}
                        />
                      </div>
                    )}
                    <div className="form-actions">
                      <button className="btn btn-primary btn-sm" type="submit" disabled={busy}>
                        Save changes
                      </button>
                      <button
                        className="btn btn-secondary btn-sm"
                        type="button"
                        onClick={() => setEditingId(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <div className="req-head">
                      <div className="stage-main">
                        <span className="stage-num">{section.stage_order}</span>
                        <div>
                          <strong>{section.stage_name}</strong>
                          <p className="stage-loc">
                            {section.location ? `${section.location} · ` : ''}{section.estimated_duration_days} day
                            {section.estimated_duration_days === 1 ? '' : 's'}
                            {section.requires_payment && ` · ₦${Number(section.payment_amount).toLocaleString()}`}
                          </p>
                          <p className="req-asked-by">
                            {section.officer_count} officer{section.officer_count === 1 ? '' : 's'} ·{' '}
                            {section.requirement_count} document
                            {section.requirement_count === 1 ? '' : 's'} requested
                            {section.pending_count > 0 && ` · ${section.pending_count} awaiting review`}
                          </p>
                          {section.prerequisite_ids.length > 0 && (
                            <p className="req-asked-by">
                              Requires first: {section.prerequisite_ids.map(nameOf).join(', ')}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="stage-actions">
                        {!section.is_active && <span className="req-tag req-tag-warn">inactive</span>}
                        <button
                          className="btn btn-secondary btn-sm"
                          type="button"
                          onClick={() => move(index, -1)}
                          disabled={busy || index === 0}
                          title="Move earlier"
                        >
                          ↑
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          type="button"
                          onClick={() => move(index, 1)}
                          disabled={busy || index === sections.length - 1}
                          title="Move later"
                        >
                          ↓
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          type="button"
                          onClick={() => openPrereqs(section)}
                        >
                          Prerequisites
                        </button>
                        <button className="btn btn-secondary btn-sm" type="button" onClick={() => startEdit(section)}>
                          Edit
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          type="button"
                          onClick={() => toggleActive(section)}
                          disabled={busy}
                        >
                          {section.is_active ? 'Deactivate' : 'Reactivate'}
                        </button>
                        {section.can_delete && (
                          <button
                            className="btn btn-danger btn-sm"
                            type="button"
                            onClick={() => remove(section)}
                            disabled={busy}
                            title="No student activity — safe to delete"
                          >
                            <IconTrash width={14} height={14} />
                          </button>
                        )}
                      </div>
                    </div>

                    {prereqFor?.id === section.id && (
                      <div className="decision-panel">
                        <p className="panel-heading">
                          Which sections must be approved before "{section.stage_name}"?
                        </p>
                        <p className="inline-form-hint">
                          A student cannot submit here until every ticked section is approved. Loops are rejected —
                          they would leave clearance impossible to finish.
                        </p>

                        {sections.filter((s) => s.id !== section.id).length === 0 ? (
                          <p className="muted-center">No other sections exist yet.</p>
                        ) : (
                          <div className="prereq-grid">
                            {sections
                              .filter((s) => s.id !== section.id)
                              .map((other) => (
                                <label className="check-row" key={other.id}>
                                  <input
                                    type="checkbox"
                                    checked={prereqPick.includes(other.id)}
                                    onChange={(e) =>
                                      setPrereqPick(
                                        e.target.checked
                                          ? [...prereqPick, other.id]
                                          : prereqPick.filter((id) => id !== other.id)
                                      )
                                    }
                                  />
                                  <span>
                                    {other.stage_order}. {other.stage_name}
                                  </span>
                                </label>
                              ))}
                          </div>
                        )}

                        <div className="form-actions">
                          <button className="btn btn-primary btn-sm" onClick={savePrereqs} disabled={busy} type="button">
                            <IconCheck width={14} height={14} />
                            Save prerequisites
                          </button>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => setPrereqFor(null)}
                            type="button"
                          >
                            <IconX width={14} height={14} />
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
