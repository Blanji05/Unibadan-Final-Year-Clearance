/**
 * CSV helpers.
 *
 * Output is meant to be opened in Excel, so two details matter: a UTF-8 BOM so
 * names with accents (and the Naira sign) render correctly, and neutralising
 * cells that start with = + - @ so a malicious value (a student can type their
 * own name) cannot run as a spreadsheet formula.
 */
function escapeCell(value) {
  if (value === null || value === undefined) return '';
  let text = value instanceof Date ? value.toISOString() : String(value);

  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;

  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * @param {string[]} headers column titles
 * @param {Array<Array<any>>} rows
 */
function toCsv(headers, rows) {
  const lines = [headers, ...rows].map((row) => row.map(escapeCell).join(','));
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

/**
 * Parse CSV text into an array of rows (arrays of strings). Handles quoted
 * fields, doubled quotes, commas/newlines inside quotes, CRLF and a BOM.
 * Fully blank lines are dropped.
 */
function parseCsv(text) {
  const src = String(text || '').replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];

    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      row.push(field);
      field = '';
      if (row.some((cell) => cell.trim() !== '')) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }

  row.push(field);
  if (row.some((cell) => cell.trim() !== '')) rows.push(row);

  return rows;
}

module.exports = { toCsv, parseCsv };

