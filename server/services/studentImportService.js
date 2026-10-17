/**
 * Bulk student import from a CSV file.
 *
 * Engineered for large batches (supporting 6,000+ students in a single upload):
 * 1. Streamlined in-memory validation and file-level deduplication.
 * 2. High-speed chunked database duplicate checking (eliminates per-row query overhead).
 * 3. Parallel multi-core password hashing via worker threads.
 * 4. Transactional multi-row batch inserts for users and clearance status rows.
 * 5. Consolidated audit logging and credentials export.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { pool, query, withTransaction } = require('../config/db');
const { ApiError } = require('../utils/apiResponse');
const { parseCsv, toCsv } = require('../utils/csv');
const { hashPasswordsBulk } = require('../utils/bulkHasher');

const MAX_ROWS = 20000; // Easily accommodates whole graduating sessions (6,000–15,000 students)
const DB_CHUNK_SIZE = 1000; // For IN (?) clauses in duplicate checks
const INSERT_BATCH_SIZE = 500; // Students per transactional multi-row insert

/**
 * Exact CSV Headers matching the official University of Ibadan student profile format.
 */
const CSV_PROFILE_HEADERS = [
  'full_name',
  'gender',
  'matric_no',
  'email',
  'Date Of birth',
  'phone_number',
  'department',
  'faculty',
  'Graduating Session',
  'hall_of_residence',
  'password',
  'Blood Group',
  'Genotype',
  'State of origin/LGA',
  'Residentaial Addresss',
  'profile_picture',
];

const ALIASES = {
  full_name: ['full_name', 'name', 'fullname', 'student_name', 'student'],
  email: ['email', 'email_address', 'e_mail', 'student_email'],
  matric_number: ['matric_number', 'matric', 'matric_no', 'matriculation_number', 'matric_num'],
  department: ['department', 'dept', 'department_name'],
  faculty: ['faculty', 'faculty_name'],
  gender: ['gender', 'sex'],
  dob: ['date_of_birth', 'dob', 'date_birth', 'birth_date'],
  graduation_session: ['graduating_session', 'graduation_session', 'session', 'academic_session'],
  hall: ['hall', 'hall_of_residence', 'residence', 'hall_of_residence_hostel', 'hostel', 'hall_residence', 'hallofresidence'],
  phone_number: ['phone_number', 'phone', 'phone_no', 'telephone', 'mobile'],
  password: ['password', 'temporary_password', 'temp_password'],
  blood_group: ['blood_group', 'bloodgroup', 'blood'],
  genotype: ['genotype'],
  state_of_origin: ['state_of_origin_lga', 'state_of_origin', 'state', 'state_lga', 'lga'],
  contact_address: [
    'residentaial_addresss',
    'residential_address',
    'residentaial_address',
    'address',
    'contact_address',
  ],
  passport_url: [
    'profile_picture',
    'profile_photo',
    'profile_image',
    'profile_pic',
    'passport',
    'passport_photo',
    'passport_photograph',
    'passport_url',
    'photo',
    'picture',
    'avatar',
    'image',
  ],
};

const normaliseHeader = (h) =>
  String(h).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Generates institutional email according to University of Ibadan standard:
 * First letter of student first name + surname + last 3 digits of matric number + '@stu.ui.edu.ng'
 * e.g., "Osunlana Anjoolaoluwa Victor" (matric: 230922) -> "aosunlana922@stu.ui.edu.ng"
 */
function generateStudentEmail(fullName, matricNumber) {
  const digits = String(matricNumber || '').replace(/\D/g, '');
  const last3 = digits.length >= 3 ? digits.slice(-3) : (String(matricNumber || '').replace(/[^a-zA-Z0-9]/g, '').slice(-3) || '001');

  const clean = String(fullName || '').replace(/,/g, ' ').trim();
  const parts = clean.split(/\s+/).filter(Boolean);

  let surname = '';
  let firstName = '';

  if (parts.length === 1) {
    surname = parts[0];
    firstName = parts[0];
  } else if (parts.length === 2) {
    // Official university records: [Surname, Firstname]
    surname = parts[0];
    firstName = parts[1];
  } else {
    // 3 or more names e.g. "Osunlana Anjoolaoluwa Victor" -> Surname: Osunlana, First: Anjoolaoluwa
    surname = parts[0];
    firstName = parts[1];
  }

  const firstLetter = firstName.charAt(0).toLowerCase();
  const cleanSurname = surname.toLowerCase().replace(/[^a-z0-9]/g, '');

  return `${firstLetter}${cleanSurname}${last3}@stu.ui.edu.ng`;
}

/** 10 characters, no look-alikes (0/O, 1/l/I), always containing a digit. */
function temporaryPassword() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const pool = letters + digits;
  const chars = Array.from({ length: 9 }, () => pool[crypto.randomInt(pool.length)]);
  chars.splice(crypto.randomInt(chars.length + 1), 0, digits[crypto.randomInt(digits.length)]);
  return chars.join('');
}

/**
 * @param {number} adminId
 * @param {string} csvText
 * @returns {Promise<{created:number, failed:Array, total:number, credentials_csv:string|null}>}
 */
async function importStudents(adminId, csvText) {
  const rows = parseCsv(csvText);
  if (rows.length < 2) {
    throw new ApiError('The file is empty. It needs a header row and at least one student.', 400);
  }

  const headers = rows[0].map(normaliseHeader);
  const column = {};
  for (const [field, names] of Object.entries(ALIASES)) {
    const idx = headers.findIndex((h) => names.includes(h));
    if (idx !== -1) column[field] = idx;
  }

  // Required columns in CSV: full_name, matric_number, department, faculty, hall_of_residence
  const missing = ['full_name', 'matric_number', 'department', 'faculty', 'hall'].filter((f) => column[f] === undefined);
  if (missing.length) {
    throw new ApiError(
      `The header row is missing required column(s): ${missing.join(', ')}. Required columns: full_name, matric_number, department, faculty, hall_of_residence. Email is optional (auto-generated if omitted).`,
      400
    );
  }

  const dataRows = rows.slice(1);
  if (dataRows.length > MAX_ROWS) {
    throw new ApiError(
      `Import at most ${MAX_ROWS.toLocaleString()} students per file (this file has ${dataRows.length.toLocaleString()}).`,
      400
    );
  }

  const cell = (row, field) =>
    column[field] === undefined ? '' : String(row[column[field]] ?? '').trim();

  const seenEmail = new Set();
  const seenMatric = new Set();
  const failed = [];
  const validCandidates = [];

  // Phase 1: In-memory syntax and file duplicate validation
  for (let i = 0; i < dataRows.length; i += 1) {
    const row = dataRows[i];
    const line = i + 2; // 1-based line number (header is line 1)

    const rawFullName = cell(row, 'full_name');
    const rawMatric = cell(row, 'matric_number');
    let rawEmail = cell(row, 'email').toLowerCase();
    const rawDept = cell(row, 'department');
    const rawFac = cell(row, 'faculty');

    // Auto-generate standard institutional email if not provided or blank
    if (!rawEmail || !EMAIL_RE.test(rawEmail)) {
      rawEmail = generateStudentEmail(rawFullName, rawMatric);
    }

    const input = {
      line,
      full_name: rawFullName,
      email: rawEmail,
      matric_number: rawMatric,
      department: rawDept,
      faculty: rawFac,
      gender: cell(row, 'gender'),
      dob: cell(row, 'dob'),
      graduation_session: cell(row, 'graduation_session'),
      hall: cell(row, 'hall'),
      phone_number: cell(row, 'phone_number'),
      password: cell(row, 'password'),
      blood_group: cell(row, 'blood_group'),
      genotype: cell(row, 'genotype'),
      state_of_origin: cell(row, 'state_of_origin'),
      contact_address: cell(row, 'contact_address'),
      passport_url: cell(row, 'passport_url'),
    };

    const fail = (reason) =>
      failed.push({ line, email: input.email, matric_number: input.matric_number, reason });

    if (input.full_name.length < 3) {
      fail('Full name is missing or too short.');
      continue;
    }
    if (input.matric_number.length < 3 || input.matric_number.length > 20) {
      fail('Matric number must be 3-20 characters.');
      continue;
    }
    if (!input.department || input.department.length < 2) {
      fail('Department is required.');
      continue;
    }
    if (!input.faculty || input.faculty.length < 2) {
      fail('Faculty is required.');
      continue;
    }
    if (!input.hall || input.hall.trim().length < 2) {
      fail('Hall of residence is compulsory.');
      continue;
    }
    if (!EMAIL_RE.test(input.email)) {
      fail('Generated or provided email is not valid.');
      continue;
    }
    if (input.password && input.password.length < 8) {
      fail('Password must be at least 8 characters (or leave blank to auto-generate).');
      continue;
    }
    if (seenEmail.has(input.email)) {
      fail('Email appears earlier in this CSV file.');
      continue;
    }
    if (seenMatric.has(input.matric_number.toLowerCase())) {
      fail('Matric number appears earlier in this CSV file.');
      continue;
    }

    seenEmail.add(input.email);
    seenMatric.add(input.matric_number.toLowerCase());

    input.plainPassword = input.password || temporaryPassword();
    validCandidates.push(input);
  }

  // Phase 2: High-speed database duplicate pre-checking in bulk chunks
  const existingEmails = new Set();
  const existingMatrics = new Set();

  for (let i = 0; i < validCandidates.length; i += DB_CHUNK_SIZE) {
    const chunk = validCandidates.slice(i, i + DB_CHUNK_SIZE);
    const emails = chunk.map((c) => c.email);
    const matrics = chunk.map((c) => c.matric_number);

    const [clashes] = await pool.query(
      'SELECT id, email, matric_number, password_hash FROM users WHERE email IN (?) OR matric_number IN (?)',
      [emails, matrics]
    );

    for (const clash of clashes) {
      if (clash.email) existingEmails.add(String(clash.email).toLowerCase());
      if (clash.matric_number) existingMatrics.add(String(clash.matric_number).toLowerCase());
    }
  }

  const toInsert = [];
  let updatedExistingCount = 0;

  for (const candidate of validCandidates) {
    const isExistingMatric = existingMatrics.has(candidate.matric_number.toLowerCase());
    const isExistingEmail = existingEmails.has(candidate.email);

    if (isExistingMatric || isExistingEmail) {
      // Existing student: update profile details, preserve password as before
      await query(
        `UPDATE users
            SET full_name = ?, department = ?, faculty = ?,
                gender = COALESCE(NULLIF(?, ''), gender),
                dob = COALESCE(NULLIF(?, ''), dob),
                graduation_session = COALESCE(NULLIF(?, ''), graduation_session),
                hall = COALESCE(NULLIF(?, ''), hall),
                phone_number = COALESCE(NULLIF(?, ''), phone_number),
                blood_group = COALESCE(NULLIF(?, ''), blood_group),
                genotype = COALESCE(NULLIF(?, ''), genotype),
                state_of_origin = COALESCE(NULLIF(?, ''), state_of_origin),
                contact_address = COALESCE(NULLIF(?, ''), contact_address),
                passport_url = COALESCE(NULLIF(?, ''), passport_url)
          WHERE LOWER(matric_number) = LOWER(?) OR LOWER(email) = LOWER(?)`,
        [
          candidate.full_name,
          candidate.department,
          candidate.faculty,
          candidate.gender,
          candidate.dob,
          candidate.graduation_session,
          candidate.hall,
          candidate.phone_number,
          candidate.blood_group,
          candidate.genotype,
          candidate.state_of_origin,
          candidate.contact_address,
          candidate.passport_url,
          candidate.matric_number,
          candidate.email,
        ]
      );
      updatedExistingCount += 1;
      continue;
    }
    toInsert.push(candidate);
  }

  // Phase 3: High-speed parallel password hashing using multi-core worker threads
  if (toInsert.length > 0) {
    const plainPasswords = toInsert.map((c) => c.plainPassword);
    const passwordHashes = await hashPasswordsBulk(plainPasswords, 6);

    for (let i = 0; i < toInsert.length; i++) {
      toInsert[i].password_hash = passwordHashes[i];
    }
  }

  // Phase 4: Fetch active clearance stages once
  const activeStages = await query(
    'SELECT id FROM clearance_stages WHERE is_active = TRUE ORDER BY stage_order'
  );

  // Phase 5: Transactional multi-row batch inserts for new students
  const credentials = [];

  for (let i = 0; i < toInsert.length; i += INSERT_BATCH_SIZE) {
    const batch = toInsert.slice(i, i + INSERT_BATCH_SIZE);

    await withTransaction(async (conn) => {
      // 1. Bulk insert students into users table with all profile columns
      const userRows = batch.map((item) => [
        item.full_name,
        item.email,
        item.password_hash,
        'student',
        item.matric_number,
        item.department || null,
        item.faculty || null,
        item.hall || null,
        item.phone_number || null,
        item.dob || null,
        item.gender || null,
        item.blood_group || null,
        item.genotype || null,
        item.state_of_origin || null,
        item.graduation_session || null,
        item.contact_address || null,
        item.passport_url || null,
      ]);

      await conn.query(
        `INSERT INTO users (
          full_name, email, password_hash, role, matric_number,
          department, faculty, hall, phone_number,
          dob, gender, blood_group, genotype,
          state_of_origin, graduation_session, contact_address,
          passport_url
        ) VALUES ?`,
        [userRows]
      );

      // 2. Retrieve newly inserted IDs
      const [insertedUsers] = await conn.query(
        'SELECT id, matric_number FROM users WHERE matric_number IN (?)',
        [batch.map((b) => b.matric_number)]
      );

      // 3. Bulk insert clearance_status rows for all active stages
      if (activeStages.length > 0 && insertedUsers.length > 0) {
        const clearanceRows = [];
        for (const u of insertedUsers) {
          for (const stage of activeStages) {
            clearanceRows.push([u.id, stage.id, 'not_started']);
          }
        }

        await conn.query(
          'INSERT IGNORE INTO clearance_status (student_id, stage_id, status) VALUES ?',
          [clearanceRows]
        );
      }
    });

    for (const item of batch) {
      credentials.push([item.matric_number, item.full_name, item.email, item.plainPassword]);
    }
  }

  // Phase 6: Consolidated audit log and real-time notification
  const totalProcessed = credentials.length + updatedExistingCount;
  await query(
    `INSERT INTO audit_logs (actor_id, action, entity_type, details) VALUES (?, 'import_students', 'users', ?)`,
    [adminId, JSON.stringify({ total: dataRows.length, created: credentials.length, updated: updatedExistingCount, failed: failed.length })]
  );

  try {
    const { emitToRole } = require('./realtimeService');
    emitToRole('admin', 'student:update', { count: totalProcessed });
  } catch (err) {
    // Non-fatal if SSE bus is offline
  }

  // Synchronize master export CSV file on disk immediately
  await syncStudentProfilesCsvFile();

  // Sort failed rows by line number for clean presentation
  failed.sort((a, b) => a.line - b.line);

  return {
    total: dataRows.length,
    created: credentials.length,
    updated: updatedExistingCount,
    failed,
    // Returned once: temporary passwords are not retrievable again after download
    credentials_csv: credentials.length
      ? toCsv(['Matric number', 'Full name', 'Email', 'Temporary password'], credentials)
      : null,
  };
}

/**
 * Generates the full CSV text containing all students in the official profile format.
 */
async function exportStudentProfilesCsv() {
  const students = await query(
    `SELECT full_name, gender, matric_number, email, dob, phone_number,
            department, faculty, graduation_session, hall,
            blood_group, genotype, state_of_origin, lga, contact_address,
            passport_url
       FROM users
      WHERE role = 'student'
      ORDER BY matric_number ASC`
  );

  const rows = students.map((s) => [
    s.full_name || '',
    s.gender || '',
    s.matric_number || '',
    s.email || '',
    s.dob || '',
    s.phone_number || '',
    s.department || '',
    s.faculty || '',
    s.graduation_session || '',
    s.hall || '',
    '', // password column remains empty
    s.blood_group || '',
    s.genotype || '',
    s.state_of_origin ? (s.lga ? `${s.state_of_origin} / ${s.lga}` : s.state_of_origin) : (s.lga || ''),
    s.contact_address || '',
    s.passport_url || '',
  ]);

  return toCsv(CSV_PROFILE_HEADERS, rows);
}

/**
 * Saves/updates the students profile CSV on disk so it reflects all edits in real time.
 */
async function syncStudentProfilesCsvFile() {
  try {
    const csvContent = await exportStudentProfilesCsv();
    const exportDir = path.join(__dirname, '../uploads/exports');
    fs.mkdirSync(exportDir, { recursive: true });
    const filePath = path.join(exportDir, 'students_profile.csv');
    fs.writeFileSync(filePath, csvContent, 'utf8');
    return filePath;
  } catch (err) {
    console.warn('[syncStudentProfilesCsvFile] Error writing CSV to disk:', err.message);
    return null;
  }
}

module.exports = {
  importStudents,
  generateStudentEmail,
  exportStudentProfilesCsv,
  syncStudentProfilesCsvFile,
  CSV_PROFILE_HEADERS,
};
