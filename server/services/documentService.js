/**
 * Document vault management.
 */
const { query, queryOne } = require('../config/db');
const { ApiError } = require('../utils/apiResponse');
const { storeFile, removeFile } = require('../config/cloudinary');

/**
 * Upload a document to the student's vault.
 */
async function uploadDocument(studentId, documentTypeId, file) {
  const docType = await queryOne('SELECT id, code, label FROM document_types WHERE id = ?', [documentTypeId]);
  if (!docType) throw new ApiError('Document type not found.', 404);

  const { url, publicId } = await storeFile(file, studentId);

  const result = await query(
    `INSERT INTO documents (student_id, document_type_id, file_url, storage_public_id, original_name, mime_type, file_size)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [studentId, documentTypeId, url, publicId, file.originalname, file.mimetype, file.size]
  );

  try {
    const { emitToUser, emitToRole } = require('./realtimeService');
    emitToUser(studentId, 'documents:update', { documentId: result.insertId, action: 'uploaded' });
    emitToUser(studentId, 'clearance:update', {});
    emitToRole('officer', 'queue:update', { studentId, documentId: result.insertId, action: 'document_uploaded' });
    emitToRole('admin', 'clearance:update', {});
  } catch (err) {
    console.warn('[realtime] document upload emit failed:', err.message);
  }

  return {
    id: result.insertId,
    document_type_id: documentTypeId,
    document_type: docType.label,
    file_url: url,
    original_name: file.originalname,
  };
}

/**
 * Documents that have been submitted to a stage that is under review ('pending')
 * or already 'approved' cannot be removed or mutated by the student.
 */
async function getLockedDocumentIds(studentId) {
  const rows = await query(
    `SELECT DISTINCT sd.document_id
       FROM submission_documents sd
       JOIN clearance_status cs ON cs.id = sd.clearance_status_id
      WHERE cs.student_id = ?
        AND cs.status IN ('pending', 'approved')`,
    [studentId]
  );
  return new Set(rows.map((r) => r.document_id));
}

/**
 * Fetch all documents in a student's vault.
 */
async function getStudentDocuments(studentId) {
  const [documents, lockedIds] = await Promise.all([
    query(
      `SELECT d.id, d.document_type_id, dt.code AS doc_code, dt.label AS doc_label,
              d.file_url, d.original_name, d.mime_type, d.file_size, d.uploaded_at
         FROM documents d
         JOIN document_types dt ON d.document_type_id = dt.id
        WHERE d.student_id = ?
        ORDER BY d.uploaded_at DESC`,
      [studentId]
    ),
    getLockedDocumentIds(studentId),
  ]);

  return documents.map((d) => ({ ...d, is_locked: lockedIds.has(d.id) }));
}

/**
 * Edit / replace an existing uploaded document with a new file.
 */
async function replaceDocument(studentId, documentId, file) {
  const doc = await queryOne(
    'SELECT id, student_id, document_type_id, file_url, storage_public_id FROM documents WHERE id = ?',
    [documentId]
  );

  if (!doc) throw new ApiError('Document not found.', 404);
  if (doc.student_id !== studentId) throw new ApiError('You can only edit your own documents.', 403);

  const { url, publicId } = await storeFile(file, studentId);

  try {
    await removeFile({ file_url: doc.file_url, storage_public_id: doc.storage_public_id });
  } catch (err) {
    console.warn('[replaceDocument] old file removal warning:', err.message);
  }

  await query(
    `UPDATE documents
     SET file_url = ?, storage_public_id = ?, original_name = ?, mime_type = ?, file_size = ?, uploaded_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [url, publicId, file.originalname, file.mimetype, file.size, documentId]
  );

  const updatedDoc = await queryOne(
    `SELECT d.id, d.document_type_id, dt.code AS doc_code, dt.label AS doc_label,
            d.file_url, d.original_name, d.mime_type, d.file_size, d.uploaded_at
       FROM documents d
       JOIN document_types dt ON d.document_type_id = dt.id
      WHERE d.id = ?`,
    [documentId]
  );

  try {
    const { emitToUser, emitToRole } = require('./realtimeService');
    emitToUser(studentId, 'documents:update', { documentId, action: 'replaced' });
    emitToUser(studentId, 'clearance:update', {});
    emitToRole('officer', 'queue:update', { studentId, documentId, action: 'document_replaced' });
    emitToRole('admin', 'clearance:update', {});
  } catch (err) {
    console.warn('[realtime] document replace emit failed:', err.message);
  }

  return updatedDoc;
}

/**
 * Cancel / delete an uploaded document in any section.
 */
async function deleteDocument(studentId, documentId) {
  const doc = await queryOne(
    'SELECT id, student_id, file_url, storage_public_id FROM documents WHERE id = ?',
    [documentId]
  );

  if (!doc) throw new ApiError('Document not found.', 404);
  if (doc.student_id !== studentId) throw new ApiError('You can only delete your own documents.', 403);

  const lockedIds = await getLockedDocumentIds(studentId);
  if (lockedIds.has(Number(documentId))) {
    throw new ApiError('This document is locked because it has been submitted for clearance. It cannot be deleted.', 409);
  }

  // Remove file from storage
  try {
    await removeFile({ file_url: doc.file_url, storage_public_id: doc.storage_public_id });
  } catch (err) {
    console.warn('[deleteDocument] removeFile warning:', err.message);
  }

  // Remove from submission links and documents table
  await query('DELETE FROM submission_documents WHERE document_id = ?', [documentId]);
  await query('DELETE FROM documents WHERE id = ?', [documentId]);

  try {
    const { emitToUser, emitToRole } = require('./realtimeService');
    emitToUser(studentId, 'documents:update', { documentId, action: 'deleted' });
    emitToUser(studentId, 'clearance:update', {});
    emitToRole('officer', 'queue:update', { studentId, documentId, action: 'document_deleted' });
    emitToRole('admin', 'clearance:update', {});
  } catch (err) {
    console.warn('[realtime] document delete emit failed:', err.message);
  }

  return { message: 'Document cancelled and removed successfully.' };
}

/**
 * Get the list of all document types so the student knows what to upload.
 */
async function getDocumentTypes() {
  return await query('SELECT id, code, label, description FROM document_types ORDER BY label');
}

/**
 * Build a stage-by-stage view of the student's vault.
 *
 * A document is stored once against its type, and `stage_requirements` maps
 * types to stages, so a shared file (e.g. school fee receipts) legitimately
 * appears under every stage that asks for it. `is_shared` flags those so the
 * UI can explain why the same upload shows up more than once.
 */
async function getDocumentsByStage(studentId) {
  const [stages, student] = await Promise.all([
    query(
      `SELECT s.id AS stage_id, s.code, s.stage_name, s.stage_order, cs.status
         FROM clearance_stages s
         LEFT JOIN clearance_status cs
                ON cs.stage_id = s.id AND cs.student_id = ?
        WHERE s.is_active = TRUE
        ORDER BY s.stage_order`,
      [studentId]
    ),
    queryOne('SELECT department, faculty FROM users WHERE id = ?', [studentId]),
  ]);

  const requirements = await query(
    `SELECT sr.stage_id, sr.is_mandatory, dt.id AS document_type_id, dt.code, dt.label, dt.description
       FROM stage_requirements sr
       JOIN document_types dt ON dt.id = sr.document_type_id
      ORDER BY sr.stage_id, dt.label`
  );

  // Already carries is_locked per document.
  const documents = await getStudentDocuments(studentId);

  // How many stages ask for each type -> drives the "shared" badge.
  const typeUsage = requirements.reduce((acc, r) => {
    acc[r.document_type_id] = (acc[r.document_type_id] || 0) + 1;
    return acc;
  }, {});

  const docsByType = documents.reduce((acc, d) => {
    (acc[d.document_type_id] = acc[d.document_type_id] || []).push(d);
    return acc;
  }, {});

  return stages.map((stage) => {
    let stage_name = stage.stage_name;
    if (stage.code === 'department' && student?.department) {
      stage_name = `Departmental Clearance — ${student.department}`;
    } else if (stage.code === 'faculty' && student?.faculty) {
      const cleanFac = student.faculty.replace(/^Faculty of\s+/i, '').trim();
      stage_name = `Faculty Clearance — Faculty of ${cleanFac}`;
    }

    const stageReqs = requirements.filter((r) => r.stage_id === stage.stage_id);

    const required_documents = stageReqs.map((r) => ({
      document_type_id: r.document_type_id,
      code: r.code,
      label: r.label,
      description: r.description,
      is_mandatory: Boolean(r.is_mandatory),
      is_shared: typeUsage[r.document_type_id] > 1,
      documents: docsByType[r.document_type_id] || [],
    }));

    const uploaded = required_documents.filter((r) => r.documents.length > 0).length;
    const mandatory = required_documents.filter((r) => r.is_mandatory);
    const mandatoryUploaded = mandatory.filter((r) => r.documents.length > 0).length;

    return {
      ...stage,
      stage_name,
      status: stage.status || 'not_started',
      required_documents,
      uploaded_count: uploaded,
      required_count: required_documents.length,
      // Drives the "ready to submit" hint on the documents page.
      all_mandatory_uploaded: mandatory.length === mandatoryUploaded,
    };
  });
}

/**
 * One row per document any section currently asks for, listing which sections
 * asked and whether the student has satisfied it.
 *
 * The per-stage view answers "what does the Library want?"; this answers the
 * question students actually start from — "what do I still need to upload?" —
 * without repeating a shared document once per stage. Since section officers
 * maintain `stage_requirements` themselves, this list is exactly what they asked
 * for, no more.
 */
async function getRequirementChecklist(studentId) {
  const requirements = await query(
    `SELECT dt.id AS document_type_id, dt.code, dt.label, dt.description,
            sr.is_mandatory, s.stage_name, s.stage_order
       FROM stage_requirements sr
       JOIN document_types dt ON dt.id = sr.document_type_id
       JOIN clearance_stages s ON s.id = sr.stage_id
      WHERE s.is_active = TRUE
      ORDER BY dt.label, s.stage_order`
  );

  const documents = await getStudentDocuments(studentId);
  const docsByType = documents.reduce((acc, d) => {
    (acc[d.document_type_id] = acc[d.document_type_id] || []).push(d);
    return acc;
  }, {});

  const byType = new Map();

  for (const r of requirements) {
    if (!byType.has(r.document_type_id)) {
      byType.set(r.document_type_id, {
        document_type_id: r.document_type_id,
        code: r.code,
        label: r.label,
        description: r.description,
        // A document is only truly required if at least one section made it mandatory.
        is_mandatory: false,
        required_by: [],
        optional_for: [],
        documents: docsByType[r.document_type_id] || [],
      });
    }

    const entry = byType.get(r.document_type_id);
    if (r.is_mandatory) {
      entry.is_mandatory = true;
      entry.required_by.push(r.stage_name);
    } else {
      entry.optional_for.push(r.stage_name);
    }
  }

  return [...byType.values()].map((entry) => ({
    ...entry,
    is_shared: entry.required_by.length + entry.optional_for.length > 1,
    is_satisfied: entry.documents.length > 0,
  }));
}

module.exports = {
  uploadDocument,
  replaceDocument,
  getStudentDocuments,
  deleteDocument,
  getDocumentTypes,
  getDocumentsByStage,
  getRequirementChecklist,
};
