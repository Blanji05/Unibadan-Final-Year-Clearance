/**
 * Clearance certificate PDF generation (PDFKit).
 */
const PDFDocument = require('pdfkit');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '..', 'generated');

/**
 * Render the clearance certificate and write it to disk.
 *
 * @returns {Promise<{filePath: string, url: string}>}
 */
async function generateCertificatePDF({ student = {}, stages, approvedStages, certificateNo = 'UI-CLR', verificationCode = '' }) {
  const stageList = Array.isArray(stages) ? stages : (Array.isArray(approvedStages) ? approvedStages : []);
  await fsp.mkdir(OUTPUT_DIR, { recursive: true });

  const fileName = `${certificateNo}.pdf`;
  const filePath = path.join(OUTPUT_DIR, fileName);

  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));

  const finished = new Promise((resolve, reject) => {
    doc.on('end', resolve);
    doc.on('error', reject);
  });

  const pageWidth = 595.28;
  const contentWidth = pageWidth - 80;
  const headerY = 30;

  // Draw UI Crest Logo
  const logoPath = path.join(__dirname, '../assets/ui-logo.jpeg');
  let logoDrawn = false;
  if (fs.existsSync(logoPath)) {
    try {
      doc.image(logoPath, 40, headerY + 2, { width: 62, height: 62 });
      logoDrawn = true;
    } catch (_) {
      logoDrawn = false;
    }
  }

  const textStartX = logoDrawn ? 114 : 40;
  const headerTextWidth = logoDrawn ? contentWidth - 74 : contentWidth;

  doc.fillColor('#002147').fontSize(16).font('Helvetica-Bold').text('UNIVERSITY OF IBADAN', textStartX, headerY + 4, { width: headerTextWidth });
  doc.fontSize(8.5).font('Helvetica').fillColor('#475569').text('IBADAN, OYO STATE, NIGERIA • STUDENT CLEARANCE MANAGEMENT SYSTEM', textStartX, headerY + 24, { width: headerTextWidth });
  doc.fontSize(11).font('Helvetica-Bold').fillColor('#002147').text('FINAL ACADEMIC & INSTITUTIONAL CLEARANCE LETTER', textStartX, headerY + 38, { width: headerTextWidth });
  doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#475569').text(`GRADUATING CLASS OF ${student.graduation_session || '2025/2026'}`, textStartX, headerY + 54, { width: headerTextWidth });

  // Blue divider bar
  doc.rect(40, headerY + 70, contentWidth, 1.5).fill('#002147');

  // Certificate Reference bar
  let curY = headerY + 76;
  doc.rect(40, curY, contentWidth, 20).fillAndStroke('#F8FAFC', '#CBD5E1');
  doc.fillColor('#002147').fontSize(8.5).font('Helvetica-Bold').text(`CERTIFICATE NO: ${certificateNo}`, 48, curY + 5);
  doc.fontSize(8.5).font('Helvetica').fillColor('#475569').text(`DATE ISSUED: ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}`, pageWidth - 215, curY + 5, { width: 165, align: 'right' });

  // Student details box
  curY += 26;
  const profileBoxHeight = 110;
  doc.rect(40, curY, contentWidth, profileBoxHeight).lineWidth(1).strokeColor('#CBD5E1').fillAndStroke('#FFFFFF', '#CBD5E1');
  doc.rect(40, curY, contentWidth, 18).fill('#002147');
  doc.fillColor('#FFFFFF').fontSize(8.5).font('Helvetica-Bold').text('STUDENT IDENTIFICATION & ACADEMIC CREDENTIALS', 48, curY + 4);

  // Passport Frame
  const passportWidth = 75;
  const passportHeight = 88;
  const passportX = pageWidth - 40 - passportWidth - 10;
  const passportY = curY + 20;

  const passportBuf = await resolveImageBuffer(student.passport_url);
  if (passportBuf) {
    try {
      doc.image(passportBuf, passportX, passportY, { width: passportWidth, height: passportHeight });
      doc.rect(passportX, passportY, passportWidth, passportHeight).lineWidth(1).strokeColor('#94A3B8').stroke();
    } catch (_) {
      drawPassportPlaceholder(doc, passportX, passportY, passportWidth, passportHeight);
    }
  } else {
    drawPassportPlaceholder(doc, passportX, passportY, passportWidth, passportHeight);
  }

  // Left Column Details
  const colX = 50;
  let lineY = curY + 24;
  const step = 14;

  const printField = (lbl, val, bold = false) => {
    doc.fillColor('#475569').fontSize(8).font('Helvetica-Bold').text(`${lbl}:`, colX, lineY, { width: 125 });
    doc.fillColor('#0F172A').fontSize(8).font(bold ? 'Helvetica-Bold' : 'Helvetica').text(String(val || '—'), colX + 130, lineY, { width: 230 });
    lineY += step;
  };

  printField('FULL NAME', student.full_name?.toUpperCase(), true);
  printField('MATRICULATION NUMBER', student.matric_number, true);
  printField('FACULTY', student.faculty);
  printField('DEPARTMENT', student.department);
  printField('DEGREE PROGRAM', student.degree_program || 'Bachelor of Science (B.Sc)');
  printField('HALL OF RESIDENCE', student.hall);

  // Certification paragraph
  curY += profileBoxHeight + 8;
  doc.rect(40, curY, contentWidth, 38).fillAndStroke('#EFF6FF', '#BFDBFE');
  doc.fillColor('#1E3A8A').fontSize(8.5).font('Helvetica-Bold').text(
    'OFFICIAL CERTIFICATION', 48, curY + 4
  );
  doc.fillColor('#1E293B').fontSize(7.5).font('Helvetica').text(
    `This is to officially certify that the student named above has fulfilled all statutory clearance obligations and satisfactorily completed all ${stageList.length} designated clearance stages of the University of Ibadan. The student has returned all university property, cleared all institutional liabilities, and is fully cleared by all academic and administrative divisions.`,
    48, curY + 15, { width: contentWidth - 16, align: 'justify', lineGap: 1.5 }
  );

  // Clearance Stages Table
  curY += 44;
  doc.rect(40, curY, contentWidth, 18).fill('#002147');
  doc.fillColor('#FFFFFF').fontSize(8).font('Helvetica-Bold').text('ENDORSED CLEARANCE STAGES BREAKDOWN', 48, curY + 5);

  curY += 18;
  const tableTop = curY;
  doc.rect(40, tableTop, contentWidth, 16).fill('#F1F5F9');
  doc.fillColor('#475569').fontSize(7.5).font('Helvetica-Bold');
  doc.text('#', 48, tableTop + 4);
  doc.text('CLEARANCE STAGE / SECTION', 70, tableTop + 4);
  doc.text('ENDORSED BY / OFFICER', 300, tableTop + 4);
  doc.text('DATE APPROVED', 430, tableTop + 4);

  curY += 16;
  stageList.forEach((stage, idx) => {
    const rowBg = idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
    doc.rect(40, curY, contentWidth, 15).fill(rowBg);
    doc.fillColor('#334155').fontSize(7.5).font('Helvetica');
    doc.text(String(idx + 1), 48, curY + 3);
    doc.font('Helvetica-Bold').text(stage.stage_name, 70, curY + 3, { width: 225 });
    doc.font('Helvetica').text(stage.officer_name || 'Authorized Clearance Officer', 300, curY + 3, { width: 125 });
    const approvedDate = stage.reviewed_at ? new Date(stage.reviewed_at).toLocaleDateString('en-GB') : 'Verified';
    doc.text(approvedDate, 430, curY + 3, { width: 110 });
    curY += 15;
  });

  // Security Seal & Verification Footer
  curY += 8;
  const sealBoxY = curY;
  const sealBoxHeight = 52;
  doc.rect(40, sealBoxY, contentWidth, sealBoxHeight).lineWidth(1).strokeColor('#CBD5E1').fillAndStroke('#F8FAFC', '#CBD5E1');

  doc.fillColor('#002147').fontSize(8).font('Helvetica-Bold').text('ELECTRONIC AUTHENTICATION & VERIFICATION', 48, sealBoxY + 5);
  doc.fillColor('#475569').fontSize(7).font('Helvetica').text(
    `Security Verification Code: ${verificationCode}\nThis document is authenticated electronically by the University of Ibadan Central Clearance Portal.\nVerify authenticity online at: https://unibadan-final-year-clearance.vercel.app/verify/${verificationCode}`,
    48, sealBoxY + 16, { width: contentWidth - 140, lineGap: 1.5 }
  );

  const stampX = pageWidth - 40 - 110;
  doc.rect(stampX, sealBoxY + 5, 102, 42).lineWidth(1.2).strokeColor('#002147').fill('#FFFFFF');
  doc.fillColor('#002147').fontSize(7.5).font('Helvetica-Bold').text('★ UI VERIFIED ★', stampX, sealBoxY + 10, { width: 102, align: 'center' });
  doc.fillColor('#00804D').fontSize(6.5).font('Helvetica-Bold').text('CLEARANCE COMPLETE', stampX, sealBoxY + 20, { width: 102, align: 'center' });
  doc.fillColor('#475569').fontSize(6).font('Helvetica').text(`REF: ${certificateNo.slice(-12)}`, stampX, sealBoxY + 30, { width: 102, align: 'center' });

  doc.fillColor('#94A3B8').fontSize(6.5).font('Helvetica').text(
    'University of Ibadan • Official Final Year Clearance Letter • Tamper-Evident Digital Document • Page 1 of 1',
    40, 800, { width: contentWidth, align: 'center' }
  );

  doc.end();
  await finished;

  const pdfBuffer = Buffer.concat(chunks);
  try {
    await fsp.writeFile(filePath, pdfBuffer);
  } catch (_) {}

  return { filePath, url: `/generated/${fileName}`, pdfBuffer };
}

/**
 * Render a payment receipt.
 */
async function generateReceiptPDF({ student, payment }) {
  const doc = new PDFDocument({ size: 'A5', margin: 40 });
  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));

  const finished = new Promise((resolve, reject) => {
    doc.on('end', resolve);
    doc.on('error', reject);
  });

  const naira = `NGN ${Number(payment.amount).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
  const paidOn = new Date(payment.paid_at || payment.created_at).toLocaleString('en-GB', {
    day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  doc.fontSize(16).font('Helvetica-Bold').text('UNIVERSITY OF IBADAN', { align: 'center' });
  doc.moveDown(0.2);
  doc.fontSize(10).font('Helvetica').text('Student Clearance Management System', { align: 'center' });
  doc.moveDown(0.8);
  doc.fontSize(14).font('Helvetica-Bold').text('PAYMENT RECEIPT', { align: 'center' });
  doc.moveDown(0.4);
  doc.moveTo(40, doc.y).lineTo(doc.page.width - 40, doc.y).stroke();
  doc.moveDown(0.8);

  const row = (label, value) => {
    doc.fontSize(10).font('Helvetica-Bold').text(`${label}: `, { continued: true });
    doc.font('Helvetica').text(String(value || '-'));
    doc.moveDown(0.15);
  };

  row('Receipt for', payment.stage_name);
  row('Student', student.full_name);
  row('Matric number', student.matric_number);
  row('Amount paid', naira);
  row('Reference', payment.reference);
  row('Gateway', payment.gateway?.includes('remita') ? 'Remita Payment Gateway' : 'Paystack Payment Gateway');
  row('Date paid', paidOn);
  row('Status', String(payment.status).toUpperCase());

  doc.moveDown(1);
  doc.fontSize(8).font('Helvetica-Oblique').text(
    'Generated electronically by the UI Student Clearance Management System. ' +
    'Valid without a signature.',
    { align: 'left' }
  );

  doc.end();
  await finished;
  return Buffer.concat(chunks);
}

const fsSync = require('fs');

async function resolveImageBuffer(imgSrc) {
  if (!imgSrc) return null;
  try {
    if (imgSrc.startsWith('data:image/')) {
      const base64Data = imgSrc.replace(/^data:image\/\w+;base64,/, '');
      return Buffer.from(base64Data, 'base64');
    }
    if (imgSrc.startsWith('http://') || imgSrc.startsWith('https://')) {
      try {
        const res = await fetch(imgSrc, { signal: AbortSignal.timeout(4000) });
        if (res.ok) {
          const ab = await res.arrayBuffer();
          return Buffer.from(ab);
        }
      } catch (fetchErr) {
        console.warn('[pdf] fetch image timeout or error:', fetchErr.message);
      }
    }
    if (imgSrc.startsWith('/uploads/') || imgSrc.startsWith('uploads/')) {
      const cleanName = imgSrc.replace(/^\/?uploads\//, '');
      const fullPath = path.join(__dirname, '..', 'uploads', cleanName);
      if (fsSync.existsSync(fullPath)) {
        return fsSync.readFileSync(fullPath);
      }
    }
    if (!imgSrc.startsWith('http://') && !imgSrc.startsWith('https://') && fsSync.existsSync(imgSrc)) {
      return fsSync.readFileSync(imgSrc);
    }
  } catch (err) {
    console.warn('[pdf] could not load image:', err.message);
  }
  return null;
}

/**
 * Render an authentic University of Ibadan Sectional Clearance Slip.
 * Contains student details, passport photo, section clearance status,
 * officer name, designation, and official signature.
 *
 * @returns {Promise<Buffer>}
 */
async function generateClearanceSlipPDF({ student, stage, clearance, officer }) {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 20, bottom: 20, left: 36, right: 36 },
    bufferPages: true,
  });
  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));

  const finished = new Promise((resolve, reject) => {
    doc.on('end', resolve);
    doc.on('error', reject);
  });

  const pageWidth = doc.page.width;
  const contentWidth = pageWidth - 72; // 36pt margins on both sides
  const slipRef = clearance.slip_reference || `UI-SLIP-${stage.stage_order || stage.id}-${student.matric_number || student.id}`;
  const reviewedDate = clearance.reviewed_at
    ? new Date(clearance.reviewed_at).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      })
    : new Date().toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      });

  // --- Formal Academic Double Border (Navy & Slate - strictly 2 colors) ---
  doc.rect(20, 20, pageWidth - 40, doc.page.height - 40).lineWidth(1.2).strokeColor('#002147').stroke();
  doc.rect(23, 23, pageWidth - 46, doc.page.height - 46).lineWidth(0.5).strokeColor('#94A3B8').stroke();

  // --- Official University Header with Logo ---
  const headerY = 32;
  const logoPath = path.join(__dirname, '../assets/ui-logo.jpeg');
  let logoDrawn = false;
  if (fs.existsSync(logoPath)) {
    try {
      doc.image(logoPath, 38, headerY + 2, { width: 62, height: 62 });
      logoDrawn = true;
    } catch {
      logoDrawn = false;
    }
  }

  const textStartX = logoDrawn ? 112 : 36;
  const headerTextWidth = logoDrawn ? contentWidth - 76 : contentWidth;

  doc.fillColor('#002147').fontSize(16).font('Helvetica-Bold').text('UNIVERSITY OF IBADAN', textStartX, headerY + 4, { width: headerTextWidth });
  doc.fontSize(8.5).font('Helvetica').fillColor('#475569').text('IBADAN, OYO STATE, NIGERIA • STUDENT CLEARANCE MANAGEMENT SYSTEM', textStartX, headerY + 24, { width: headerTextWidth });
  doc.fontSize(11).font('Helvetica-Bold').fillColor('#002147').text('OFFICIAL SECTIONAL CLEARANCE SLIP', textStartX, headerY + 38, { width: headerTextWidth });
  doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#475569').text(`ACADEMIC SECTION: ${(stage.stage_name || 'CLEARANCE UNIT').toUpperCase()}`, textStartX, headerY + 54, { width: headerTextWidth });

  // Single clean institutional divider line
  doc.rect(36, headerY + 70, contentWidth, 1.5).fill('#002147');

  // --- Slip Reference & Date Bar ---
  let curY = headerY + 76;
  doc.rect(36, curY, contentWidth, 20).fillAndStroke('#F8FAFC', '#CBD5E1');
  doc.fillColor('#002147').fontSize(8.5).font('Helvetica-Bold').text(`SLIP REFERENCE: ${slipRef}`, 44, curY + 5);
  doc.fontSize(8.5).font('Helvetica').fillColor('#475569').text(`DATE ISSUED: ${reviewedDate}`, pageWidth - 210, curY + 5, { width: 165, align: 'right' });

  // --- 1. Student Identification & Academic Record Box ---
  curY += 25;
  const profileBoxHeight = 118;
  doc.rect(36, curY, contentWidth, profileBoxHeight).lineWidth(1).strokeColor('#CBD5E1').fillAndStroke('#FFFFFF', '#CBD5E1');
  doc.rect(36, curY, contentWidth, 18).fill('#002147');
  doc.fillColor('#FFFFFF').fontSize(8.5).font('Helvetica-Bold').text('STUDENT IDENTIFICATION & ACADEMIC INFORMATION', 44, curY + 4);

  // Passport Frame
  const passportWidth = 75;
  const passportHeight = 90;
  const passportX = pageWidth - 36 - passportWidth - 10;
  const passportY = curY + 23;

  const passportBuf = await resolveImageBuffer(student.passport_url);
  if (passportBuf) {
    try {
      doc.image(passportBuf, passportX, passportY, { width: passportWidth, height: passportHeight });
      doc.rect(passportX, passportY, passportWidth, passportHeight).lineWidth(1).strokeColor('#94A3B8').stroke();
    } catch {
      drawPassportPlaceholder(doc, passportX, passportY, passportWidth, passportHeight);
    }
  } else {
    drawPassportPlaceholder(doc, passportX, passportY, passportWidth, passportHeight);
  }

  // Left Column Details
  const colX = 46;
  let lineY = curY + 24;
  const step = 15;

  const printStudentField = (lbl, val, bold = false) => {
    doc.fillColor('#475569').fontSize(8.5).font('Helvetica-Bold').text(`${lbl}:`, colX, lineY, { width: 125 });
    doc.fillColor('#0F172A').fontSize(8.5).font(bold ? 'Helvetica-Bold' : 'Helvetica').text(String(val || '—'), colX + 130, lineY, { width: 235 });
    lineY += step;
  };

  printStudentField('FULL NAME', (student.full_name || '').toUpperCase(), true);
  printStudentField('MATRICULATION NO', student.matric_number || '—', true);
  printStudentField('FACULTY', student.faculty || '—');
  printStudentField('DEPARTMENT', student.department || '—');
  printStudentField('HALL OF RESIDENCE', student.hall || 'Off-Campus / Not Allocated');
  printStudentField('INSTITUTIONAL EMAIL', student.email || '—');

  // --- 2. Clearance Verification & Status Box ---
  curY += profileBoxHeight + 7;
  const secBoxHeight = 98;
  doc.rect(36, curY, contentWidth, secBoxHeight).lineWidth(1).strokeColor('#CBD5E1').fillAndStroke('#FFFFFF', '#CBD5E1');
  doc.rect(36, curY, contentWidth, 18).fill('#002147');
  doc.fillColor('#FFFFFF').fontSize(8.5).font('Helvetica-Bold').text('CLEARANCE SECTION VERIFICATION & CLEARANCE STATUS', 44, curY + 4);

  let statusY = curY + 24;
  const printSecRow = (lbl, val, isHighlight = false) => {
    doc.fillColor('#475569').fontSize(8.5).font('Helvetica-Bold').text(`${lbl}:`, 46, statusY, { width: 135 });
    doc.fillColor(isHighlight ? '#002147' : '#0F172A').fontSize(8.5).font(isHighlight ? 'Helvetica-Bold' : 'Helvetica').text(String(val || '—'), 185, statusY, { width: 335 });
    statusY += 15;
  };

  printSecRow('CLEARANCE SECTION', stage.stage_name || 'Academic Unit Clearance', true);
  printSecRow('CLEARANCE STATUS', 'VERIFIED & CLEARED (PASSED)', true);
  printSecRow('CLEARANCE MODE', 'Online Digital Clearance Portal');
  printSecRow('DATE APPROVED', reviewedDate);
  printSecRow('OFFICER REMARKS', clearance.remarks || 'Cleared all section requirements, returned university property, and fulfilled non-indebtedness obligations.');

  // --- 3. Officer Endorsement & Signature Box ---
  curY += secBoxHeight + 7;
  const certBoxHeight = 135;
  doc.rect(36, curY, contentWidth, certBoxHeight).lineWidth(1).strokeColor('#CBD5E1').fillAndStroke('#F8FAFC', '#CBD5E1');
  doc.rect(36, curY, contentWidth, 18).fill('#002147');
  doc.fillColor('#FFFFFF').fontSize(8.5).font('Helvetica-Bold').text('SECTION CLEARANCE OFFICER ENDORSEMENT & SIGNATURE', 44, curY + 4);

  // Attestation text
  doc.fillColor('#334155').fontSize(8).font('Helvetica-Oblique').text(
    'I hereby attest and certify that the student named above has satisfied all non-indebtedness requirements, fulfilled all obligations, and is hereby officially cleared for this clearance section.',
    46,
    curY + 23,
    { width: contentWidth - 20, align: 'justify' }
  );

  // Officer info on left
  const officerName = officer?.full_name || clearance.officer_name_snapshot || 'Section Clearance Officer';
  const officerTitle = officer?.title || (stage.code === 'department' ? 'Departmental Clearance Officer' : stage.code === 'faculty' ? 'Faculty Clearance Officer' : `${stage.stage_name} Officer`);

  let offY = curY + 45;
  doc.fillColor('#475569').fontSize(7.5).font('Helvetica-Bold').text('ENDORSED BY:', 46, offY);
  offY += 11;
  doc.fillColor('#002147').fontSize(9.5).font('Helvetica-Bold').text(officerName, 46, offY);
  offY += 13;
  doc.fillColor('#334155').fontSize(8).font('Helvetica').text(officerTitle, 46, offY);
  offY += 11;
  if (officer?.email) {
    doc.fillColor('#64748B').fontSize(7.5).font('Helvetica').text(`Official Email: ${officer.email}`, 46, offY);
    offY += 10;
  }
  doc.fillColor('#64748B').fontSize(7.5).font('Helvetica').text(`Date Endorsed: ${reviewedDate}`, 46, offY);

  // Signature box on right
  const sigBoxX = pageWidth - 36 - 155;
  const sigBoxY = curY + 45;
  const sigWidth = 145;
  const sigHeight = 52;

  doc.rect(sigBoxX, sigBoxY, sigWidth, sigHeight).lineWidth(0.8).strokeColor('#CBD5E1').fillAndStroke('#FFFFFF', '#CBD5E1');
  doc.fillColor('#64748B').fontSize(7).font('Helvetica-Bold').text('OFFICER DIGITAL SIGNATURE', sigBoxX + 6, sigBoxY + 4);

  const sigSrc = officer?.signature_url || clearance.officer_signature_snapshot;
  const sigBuf = await resolveImageBuffer(sigSrc);
  if (sigBuf) {
    try {
      doc.image(sigBuf, sigBoxX + 12, sigBoxY + 12, { width: 120, height: 34 });
    } catch {
      drawSignatureFallback(doc, sigBoxX, sigBoxY, officerName);
    }
  } else {
    drawSignatureFallback(doc, sigBoxX, sigBoxY, officerName);
  }

  // Official Seal
  const sealX = sigBoxX + 18;
  const sealY = curY + 104;
  doc.rect(sealX, sealY, 110, 20).lineWidth(1).strokeColor('#002147').fillAndStroke('#FFFFFF', '#002147');
  doc.fillColor('#002147').fontSize(7.5).font('Helvetica-Bold').text('★ UI VERIFIED CLEARANCE ★', sealX, sealY + 3, { width: 110, align: 'center' });
  doc.fillColor('#475569').fontSize(6.5).font('Helvetica').text(`REF: ${slipRef.slice(-10)}`, sealX, sealY + 11, { width: 110, align: 'center' });

  // --- 4. Prerequisite Notice Box ---
  curY += certBoxHeight + 7;
  const noticeHeight = 58;
  doc.rect(36, curY, contentWidth, noticeHeight).lineWidth(0.8).strokeColor('#CBD5E1').fillAndStroke('#F8FAFC', '#CBD5E1');
  doc.fillColor('#002147').fontSize(7.5).font('Helvetica-Bold').text('NOTICE TO PREREQUISITE CLEARANCE UNITS:', 44, curY + 5);
  doc.fillColor('#334155').fontSize(7.5).font('Helvetica').text(
    'This official sectional clearance slip confirms that the student has fulfilled all clearance obligations for this specific academic unit. ' +
    'Students clearing subsequent stages (including Faculty Office, Sports Council, Bursary Division, and Student Affairs) may present this slip or its reference number as authenticated proof of prior stage clearance. ' +
    'Any alteration or falsification of this document is a serious academic infraction under University of Ibadan regulations.',
    44,
    curY + 16,
    { width: contentWidth - 16, align: 'justify' }
  );

  // --- 5. Security Footer Bar ---
  const footY = doc.page.height - 48;
  doc.moveTo(36, footY).lineTo(pageWidth - 36, footY).lineWidth(0.8).strokeColor('#002147').stroke();
  doc.fillColor('#64748B').fontSize(7).font('Helvetica').text(
    'University of Ibadan Student Clearance Portal • Generated electronically • Security Ref: ' + slipRef + ' • Strictly 1 Page Document',
    36,
    footY + 5,
    { align: 'center', width: contentWidth, lineBreak: false }
  );

  doc.end();
  await finished;
  return Buffer.concat(chunks);
}

function drawPassportPlaceholder(doc, x, y, width, height) {
  doc.rect(x, y, width, height).lineWidth(1).dash(3, { space: 3 }).strokeColor('#94A3B8').stroke();
  doc.undash();
  doc.fillColor('#94A3B8').fontSize(8).font('Helvetica').text('STUDENT\nPASSPORT\nPHOTO', x, y + 36, { width, align: 'center' });
}

function drawSignatureFallback(doc, x, y, name) {
  doc.fillColor('#0369A1').fontSize(11).font('Helvetica-Oblique').text(name, x + 10, y + 25, { width: 140, align: 'center' });
}

module.exports = { generateCertificatePDF, generateReceiptPDF, generateClearanceSlipPDF, OUTPUT_DIR };

