/**
 * Utility to resolve document and image URLs across local, Vercel, and Render deployments.
 */
export function resolveFileUrl(url, docId) {
  const backendBase = (import.meta.env.VITE_API_URL || 'https://unibadan-final-year-clearance.onrender.com').replace(/\/api\/?$/, '');
  
  if (docId) {
    return `${backendBase}/api/documents/${docId}/file`;
  }
  if (!url) return '';
  if (url.startsWith('data:') || url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  return `${backendBase}${url.startsWith('/') ? '' : '/'}${url}`;
}

export function resolveImageUrl(url) {
  if (!url) return '';
  if (url.startsWith('data:') || url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  const backendBase = (import.meta.env.VITE_API_URL || 'https://unibadan-final-year-clearance.onrender.com').replace(/\/api\/?$/, '');
  return `${backendBase}${url.startsWith('/') ? '' : '/'}${url}`;
}

