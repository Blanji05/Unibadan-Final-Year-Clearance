/**
 * Save a Blob the browser already holds (PDF receipt, CSV export) to disk.
 * These endpoints need the Authorization header, so they can't be plain links.
 */
export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

