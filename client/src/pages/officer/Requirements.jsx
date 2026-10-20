import { useCallback, useEffect, useMemo, useState } from 'react';
import { officerApi } from '../../services/api';
import { realtime } from '../../services/realtime';
import { IconClipboard, IconFile, IconPlus, IconTrash } from '../../components/Icons';
import { EmptyState, SectionHeader, SkeletonList, StatCard } from '../../components/Ui';

/**
 * Requirements & Custom Form Builder Page
 *
 * Allows section officers to:
 * 1. Decide exactly which documents students must upload for their clearance stage.
 * 2. Create and configure custom section form fields/questions that appear on the student portal.
 */
export default function Requirements() {
  const [activeTab, setActiveTab] = useState('documents'); // 'documents' | 'form_builder'
  const [stage, setStage] = useState(null);
  const [requirements, setRequirements] = useState([]);
  const [inFlight, setInFlight] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // "Create a new document type" form.
  const [showDocForm, setShowDocForm] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newMandatory, setNewMandatory] = useState(true);
  const [creatingDoc, setCreatingDoc] = useState(false);
  const [searchAvailable, setSearchAvailable] = useState('');

  // Section Form Fields state
  const [formFields, setFormFields] = useState([]);
  const [showFieldForm, setShowFieldForm] = useState(false);
  const [editingFieldId, setEditingFieldId] = useState(null);
  const [fieldLabel, setFieldLabel] = useState('');
  const [fieldType, setFieldType] = useState('text');
  const [fieldOptions, setFieldOptions] = useState('');
  const [fieldPlaceholder, setFieldPlaceholder] = useState('');
  const [fieldHelpText, setFieldHelpText] = useState('');
  const [fieldRequired, setFieldRequired] = useState(true);
  const [savingField, setSavingField] = useState(false);

  const load = useCallback(async () => {
    try {
      const [reqData, fieldData] = await Promise.all([
        officerApi.requirements(),
        officerApi.formFields().catch(() => ({ fields: [] })),
      ]);
      setStage(reqData.stage || null);
      setRequirements(reqData.requirements || []);
      setInFlight(reqData.students_in_flight || 0);
      setFormFields(fieldData.fields || []);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await load();
      setLoading(false);
    })();

    const unsubStages = realtime.on('stages:update', () => load());
    const unsubQueue = realtime.on('queue:update', () => load());
    return () => {
      unsubStages();
      unsubQueue();
    };
  }, [load]);

  const required = useMemo(() => requirements.filter((r) => r.is_required), [requirements]);
  const available = useMemo(() => requirements.filter((r) => !r.is_required), [requirements]);
  const filteredAvailable = useMemo(() => {
    if (!searchAvailable.trim()) return available;
    const q = searchAvailable.toLowerCase().trim();
    return available.filter(
      (r) =>
        r.label?.toLowerCase().includes(q) ||
        (r.description && r.description.toLowerCase().includes(q))
    );
  }, [available, searchAvailable]);

  const runAction = async (id, action, successMessage) => {
    setError('');
    setNotice('');
    try {
      setBusyId(id);
      await action();
      await load();
      setNotice(successMessage);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const handleAdd = (req) =>
    runAction(
      req.document_type_id,
      () => officerApi.addRequirement(req.document_type_id, true),
      `Students will now be asked for "${req.label}".`
    );

  const handleRemove = (req) => {
    if (!window.confirm(`Stop requesting "${req.label}" from students?`)) return;
    runAction(
      req.document_type_id,
      () => officerApi.removeRequirement(req.document_type_id),
      `"${req.label}" is no longer requested.`
    );
  };

  /** Toggle between "must upload" and "optional". */
  const handleToggleMandatory = (req) =>
    runAction(
      req.document_type_id,
      () => officerApi.addRequirement(req.document_type_id, !req.is_mandatory),
      `"${req.label}" is now ${req.is_mandatory ? 'optional' : 'required'}.`
    );

  const handleCreateDoc = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    try {
      setCreatingDoc(true);
      const result = await officerApi.createDocumentType({
        label: newLabel,
        description: newDescription,
        is_mandatory: newMandatory,
      });
      setNewLabel('');
      setNewDescription('');
      setNewMandatory(true);
      setShowDocForm(false);
      await load();
      setNotice(result.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setCreatingDoc(false);
    }
  };

  // --- Form Builder Handlers ---
  const handleOpenAddField = () => {
    setEditingFieldId(null);
    setFieldLabel('');
    setFieldType('text');
    setFieldOptions('');
    setFieldPlaceholder('');
    setFieldHelpText('');
    setFieldRequired(true);
    setShowFieldForm(true);
  };

  const handleOpenEditField = (field) => {
    setEditingFieldId(field.id);
    setFieldLabel(field.field_label);
    setFieldType(field.field_type);
    setFieldOptions(Array.isArray(field.options) ? field.options.join(', ') : '');
    setFieldPlaceholder(field.placeholder || '');
    setFieldHelpText(field.help_text || '');
    setFieldRequired(field.is_required);
    setShowFieldForm(true);
  };

  const handleSaveField = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    try {
      setSavingField(true);
      const payload = {
        field_label: fieldLabel.trim(),
        field_type: fieldType,
        field_options: fieldType === 'select' ? fieldOptions : null,
        placeholder: fieldPlaceholder.trim() || null,
        help_text: fieldHelpText.trim() || null,
        is_required: fieldRequired,
      };

      if (editingFieldId) {
        await officerApi.updateFormField(editingFieldId, payload);
        setNotice('Form question updated successfully.');
      } else {
        await officerApi.addFormField(payload);
        setNotice('New question added to student clearance form.');
      }

      setShowFieldForm(false);
      setEditingFieldId(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingField(false);
    }
  };

  const handleDeleteField = async (field) => {
    if (!window.confirm(`Delete "${field.field_label}" from the student clearance form?`)) return;
    setError('');
    setNotice('');
    try {
      setBusyId(field.id);
      await officerApi.deleteFormField(field.id);
      setNotice(`"${field.field_label}" removed from form.`);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleFieldRequired = async (field) => {
    setError('');
    try {
      setBusyId(field.id);
      await officerApi.updateFormField(field.id, {
        field_label: field.field_label,
        field_type: field.field_type,
        field_options: field.field_options,
        placeholder: field.placeholder,
        help_text: field.help_text,
        is_required: !field.is_required,
      });
      await load();
      setNotice(`"${field.field_label}" is now ${field.is_required ? 'optional' : 'required'}.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <div className="card">
        <SkeletonList rows={5} />
      </div>
    );
  }

  return (
    <div className="stack">
      {error && <div className="error">{error}</div>}
      {notice && <div className="notice">{notice}</div>}

      {/* Top View Selector Tabs */}
      <div className="card" style={{ padding: '0.6rem 0.8rem', marginBottom: '0.5rem' }}>
        <div className="tab-row" style={{ margin: 0 }}>
          <button
            type="button"
            className={`tab ${activeTab === 'documents' ? 'active' : ''}`}
            onClick={() => setActiveTab('documents')}
          >
            📁 Required Documents ({required.length})
          </button>
          <button
            type="button"
            className={`tab ${activeTab === 'form_builder' ? 'active' : ''}`}
            onClick={() => setActiveTab('form_builder')}
          >
            📝 Section Clearance Form ({formFields.length} Questions)
          </button>
        </div>
      </div>

      {activeTab === 'documents' ? (
        <>
          <div className="stat-grid">
            <StatCard label="Documents requested" value={required.length} icon={IconClipboard} />
            <StatCard
              label="Must upload"
              value={required.filter((r) => r.is_mandatory).length}
              hint="Blocks submission if missing"
              tone="success"
            />
            <StatCard
              label="Students awaiting review"
              value={inFlight}
              hint={inFlight ? 'Already submitted under the current list' : 'Queue is clear'}
            />
          </div>

          <div className="card">
            <SectionHeader
              title={stage ? `${stage.stage_name} Requirements` : 'Required documents'}
              description="Official requirements for your section. Add custom requirements or select from the university catalog."
              action={
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => setShowDocForm((v) => !v)}
                >
                  <IconPlus width={15} height={15} />
                  {showDocForm ? 'Close Form' : 'Add Custom Requirement'}
                </button>
              }
            />

            {showDocForm && (
              <div
                className="officer-add-box"
                style={{
                  background: '#f8fafc',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  padding: '1.25rem',
                  marginBottom: '1.25rem',
                }}
              >
                <h4 style={{ margin: '0 0 0.4rem', color: '#0f172a' }}>
                  Add New Document Requirement for {stage?.stage_name}
                </h4>
                <p className="inline-form-hint" style={{ marginTop: 0 }}>
                  Specify any additional document, clearance slip, dues receipt, or sign-off students must upload to receive clearance in your section.
                </p>
                <form onSubmit={handleCreateDoc}>
                  <div className="form-row">
                    <label>
                      Document Name / Title
                      <input
                        type="text"
                        value={newLabel}
                        onChange={(e) => setNewLabel(e.target.value)}
                        placeholder="e.g. Departmental Dues Receipt, Sports Kit Clearance Slip"
                        required
                        minLength={3}
                        maxLength={150}
                      />
                    </label>
                    <label>
                      Instructions for Students (optional)
                      <input
                        type="text"
                        value={newDescription}
                        onChange={(e) => setNewDescription(e.target.value)}
                        placeholder="e.g. Obtain from HOD Office Room 102"
                        maxLength={255}
                      />
                    </label>
                  </div>
                  <label className="check-row" style={{ margin: '0.85rem 0' }}>
                    <input
                      type="checkbox"
                      checked={newMandatory}
                      onChange={(e) => setNewMandatory(e.target.checked)}
                    />
                    Mandatory (Students cannot submit until this document is attached)
                  </label>
                  <div className="form-actions">
                    <button type="submit" className="btn btn-primary btn-sm" disabled={creatingDoc}>
                      {creatingDoc ? 'Saving…' : 'Add Requirement'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setShowDocForm(false)}
                      disabled={creatingDoc}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            )}

            {inFlight > 0 && (
              <div className="notice notice-warn">
                {inFlight} student{inFlight === 1 ? '' : 's'} already submitted under the current list.
                Adding a document now means their submission will be missing it.
              </div>
            )}

            {required.length === 0 ? (
              <EmptyState
                icon={IconClipboard}
                title="No documents requested yet"
                message="Your section currently accepts submissions with no attachments. Add a document below to start asking students for it."
              />
            ) : (
              <ul className="req-list">
                {required.map((req) => (
                  <li key={req.document_type_id} className="req-item">
                    <div className="req-head">
                      <div>
                        <strong>{req.label}</strong>
                        {req.is_mandatory ? (
                          <span className="req-tag req-tag-required">required</span>
                        ) : (
                          <span className="req-tag">optional</span>
                        )}
                        {req.used_by_other_stages > 0 && (
                          <span
                            className="req-tag"
                            title={`Also requested by ${req.used_by_other_stages} other stage(s)`}
                          >
                            shared
                          </span>
                        )}
                        {req.description && <p className="req-desc">{req.description}</p>}
                      </div>

                      <div className="row-actions">
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleToggleMandatory(req)}
                          disabled={busyId === req.document_type_id}
                        >
                          Make {req.is_mandatory ? 'optional' : 'required'}
                        </button>
                        <button
                          type="button"
                          className="link-danger"
                          onClick={() => handleRemove(req)}
                          disabled={busyId === req.document_type_id}
                        >
                          <IconTrash width={14} height={14} />
                          Remove
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card">
            <SectionHeader
              title="University document library"
              description="Available documents in the University of Ibadan catalog — request any for your section"
              action={
                available.length > 3 && (
                  <input
                    type="text"
                    placeholder="Search catalog..."
                    value={searchAvailable}
                    onChange={(e) => setSearchAvailable(e.target.value)}
                    className="form-input"
                    style={{
                      height: '32px',
                      fontSize: '0.825rem',
                      padding: '0 0.75rem',
                      borderRadius: '5px',
                      width: '180px',
                    }}
                  />
                )
              }
            />

            {available.length === 0 ? (
              <EmptyState
                icon={IconFile}
                title="Everything is already requested"
                message="Your section asks for every document type the system knows about."
              />
            ) : filteredAvailable.length === 0 ? (
              <EmptyState
                icon={IconFile}
                title="No matching documents"
                message={`No available documents match "${searchAvailable}".`}
              />
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Document</th>
                      <th>Description</th>
                      <th>Used by</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAvailable.map((req) => (
                      <tr key={req.document_type_id}>
                        <td>
                          <span className="file-link">
                            <IconFile width={15} height={15} />
                            {req.label}
                          </span>
                        </td>
                        <td className="cell-muted">{req.description || '—'}</td>
                        <td className="cell-muted">
                          {req.used_by_other_stages === 0
                            ? 'No other stage'
                            : `${req.used_by_other_stages} other stage${
                                req.used_by_other_stages === 1 ? '' : 's'
                              }`}
                        </td>
                        <td className="row-actions">
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => handleAdd(req)}
                            disabled={busyId === req.document_type_id}
                          >
                            <IconPlus width={14} height={14} />
                            Request
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : (
        /* Section Clearance Custom Form Builder */
        <>
          <div className="stat-grid">
            <StatCard label="Form questions" value={formFields.length} icon={IconClipboard} />
            <StatCard
              label="Mandatory questions"
              value={formFields.filter((f) => f.is_required).length}
              hint="Required before student can submit"
              tone="success"
            />
            <StatCard
              label="Optional questions"
              value={formFields.filter((f) => !f.is_required).length}
            />
          </div>

          <div className="card">
            <SectionHeader
              title={`${stage?.stage_name || 'Section'} — Custom Clearance Form`}
              description="Configure custom questions that students must answer when completing clearance for your section"
              action={
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={handleOpenAddField}
                >
                  <IconPlus width={15} height={15} />
                  Add Custom Question
                </button>
              }
            />

            {showFieldForm && (
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  padding: '1.25rem',
                  marginBottom: '1.25rem',
                }}
              >
                <h4 style={{ margin: '0 0 0.4rem', color: '#0f172a' }}>
                  {editingFieldId ? 'Edit Form Question' : `Add New Form Question for ${stage?.stage_name}`}
                </h4>
                <p className="inline-form-hint" style={{ marginTop: 0 }}>
                  This field will appear in the student's clearance portal for this section.
                </p>

                <form onSubmit={handleSaveField}>
                  <div className="form-row">
                    <label>
                      Question / Field Label *
                      <input
                        type="text"
                        value={fieldLabel}
                        onChange={(e) => setFieldLabel(e.target.value)}
                        placeholder="e.g. Hostel Room Number, Library Barcode, Supervisor Name"
                        required
                        minLength={2}
                        maxLength={250}
                      />
                    </label>

                    <label>
                      Field Input Type *
                      <select
                        value={fieldType}
                        onChange={(e) => setFieldType(e.target.value)}
                        style={{ height: '38px', borderRadius: '4px' }}
                      >
                        <option value="text">Short Text (One line)</option>
                        <option value="textarea">Long Text / Paragraph</option>
                        <option value="number">Number</option>
                        <option value="date">Date</option>
                        <option value="select">Dropdown Selection</option>
                      </select>
                    </label>
                  </div>

                  {fieldType === 'select' && (
                    <div style={{ marginTop: '0.75rem' }}>
                      <label>
                        Dropdown Options (comma-separated) *
                        <input
                          type="text"
                          value={fieldOptions}
                          onChange={(e) => setFieldOptions(e.target.value)}
                          placeholder="e.g. Resident Student, Off-Campus Student, Never Resided"
                          required
                        />
                      </label>
                    </div>
                  )}

                  <div className="form-row" style={{ marginTop: '0.75rem' }}>
                    <label>
                      Placeholder Text (optional)
                      <input
                        type="text"
                        value={fieldPlaceholder}
                        onChange={(e) => setFieldPlaceholder(e.target.value)}
                        placeholder="e.g. Block B, Room 12"
                      />
                    </label>
                    <label>
                      Help Instructions for Student (optional)
                      <input
                        type="text"
                        value={fieldHelpText}
                        onChange={(e) => setFieldHelpText(e.target.value)}
                        placeholder="e.g. Found on your payment receipt slip"
                      />
                    </label>
                  </div>

                  <label className="check-row" style={{ margin: '0.85rem 0' }}>
                    <input
                      type="checkbox"
                      checked={fieldRequired}
                      onChange={(e) => setFieldRequired(e.target.checked)}
                    />
                    Mandatory (Student cannot submit clearance without answering this question)
                  </label>

                  <div className="form-actions">
                    <button type="submit" className="btn btn-primary btn-sm" disabled={savingField}>
                      {savingField ? 'Saving…' : editingFieldId ? 'Update Question' : 'Add Question to Form'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setShowFieldForm(false)}
                      disabled={savingField}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            )}

            {formFields.length === 0 ? (
              <EmptyState
                icon={IconClipboard}
                title="No custom form fields created yet"
                message="Click 'Add Custom Question' above to add fields that students must answer when completing clearance in your section."
              />
            ) : (
              <ul className="req-list">
                {formFields.map((field, idx) => (
                  <li key={field.id} className="req-item">
                    <div className="req-head">
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <span
                            style={{
                              background: '#e2e8f0',
                              color: '#334155',
                              padding: '2px 7px',
                              borderRadius: '4px',
                              fontSize: '0.78rem',
                              fontWeight: 700,
                            }}
                          >
                            Q{idx + 1}
                          </span>
                          <strong>{field.field_label}</strong>
                          <span
                            style={{
                              background: '#fef7ee',
                              color: '#78350f',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              textTransform: 'uppercase',
                            }}
                          >
                            {field.field_type}
                          </span>
                          {field.is_required ? (
                            <span className="req-tag req-tag-required">required</span>
                          ) : (
                            <span className="req-tag">optional</span>
                          )}
                        </div>

                        {field.help_text && (
                          <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: '#64748b' }}>
                            ℹ️ {field.help_text}
                          </p>
                        )}
                        {field.placeholder && (
                          <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: '#94a3b8' }}>
                            Placeholder: <em>"{field.placeholder}"</em>
                          </p>
                        )}
                        {field.field_type === 'select' && (field.options || []).length > 0 && (
                          <div style={{ margin: '4px 0 0', fontSize: '0.8rem', color: '#475569' }}>
                            Options: <strong>{(field.options || []).join(' | ')}</strong>
                          </div>
                        )}
                      </div>

                      <div className="row-actions">
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleToggleFieldRequired(field)}
                          disabled={busyId === field.id}
                        >
                          Make {field.is_required ? 'optional' : 'required'}
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleOpenEditField(field)}
                          disabled={busyId === field.id}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="link-danger"
                          onClick={() => handleDeleteField(field)}
                          disabled={busyId === field.id}
                        >
                          <IconTrash width={14} height={14} />
                          Delete
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Live Student Form Preview Box */}
          {formFields.length > 0 && (
            <div className="card" style={{ background: '#f8fafc', border: '1px solid #cbd5e1' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                <h4 style={{ margin: 0, color: '#0f172a' }}>
                  👁️ Live Student Portal View (How students see this form)
                </h4>
                <span style={{ fontSize: '0.8rem', color: '#64748b', fontStyle: 'italic' }}>
                  Interactive preview
                </span>
              </div>
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1.25rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  {formFields.map((f) => (
                    <div key={f.id} className="form-group" style={{ marginBottom: 0 }}>
                      <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.25rem' }}>
                        {f.field_label}
                        {f.is_required && <span style={{ color: '#ef4444', marginLeft: '4px' }}>*</span>}
                      </label>
                      {f.help_text && (
                        <p style={{ margin: '0 0 0.35rem', fontSize: '0.75rem', color: '#64748b' }}>
                          {f.help_text}
                        </p>
                      )}
                      {f.field_type === 'textarea' ? (
                        <textarea rows={2} placeholder={f.placeholder || ''} className="form-textarea" readOnly />
                      ) : f.field_type === 'select' ? (
                        <select className="form-select" style={{ width: '100%', padding: '0.45rem', borderRadius: 4 }} disabled>
                          <option>{f.placeholder || 'Select option...'}</option>
                          {(f.options || []).map((o) => (
                            <option key={o}>{o}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type={f.field_type}
                          placeholder={f.placeholder || ''}
                          className="form-input"
                          style={{ width: '100%', padding: '0.45rem', borderRadius: 4 }}
                          readOnly
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
