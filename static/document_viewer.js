const documentId = Number(window.location.pathname.match(/\/documents\/(\d+)\/view/)?.[1]);
const viewerToast = document.querySelector('#viewer-toast');
let zoom = 1;
let page = 1;
let pageCount = 5;
let documentRecord;

function toast(message) {
  viewerToast.textContent = message;
  viewerToast.classList.add('visible');
  setTimeout(() => viewerToast.classList.remove('visible'), 2800);
}

function displaySize(bytes) {
  if (!bytes) return '—';
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(bytes % (1024 * 1024) ? 1 : 0)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function displayDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString(undefined, { month: 'short', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function setPage(next) {
  page = Math.max(1, Math.min(pageCount, next));
  document.querySelector('#page-number').textContent = page;
  document.querySelector('#page-prev').disabled = page <= 1;
  document.querySelector('#page-next').disabled = page >= pageCount;
}

function setZoom(value) {
  zoom = Math.max(.5, Math.min(2, value));
  document.querySelector('#document-page').style.transform = `scale(${zoom})`;
  document.querySelector('#zoom-level').textContent = `${Math.round(zoom * 100)}%`;
}

async function downloadDocument() {
  try {
    const response = await fetch(`/api/documents/${documentId}/download`);
    if (!response.ok) {
      const result = await response.json();
      throw new Error(result.error || 'Download failed.');
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = documentRecord.filename;
    link.click();
    URL.revokeObjectURL(url);
  } catch (error) { toast(error.message); }
}

async function loadDocument() {
  if (!documentId) { toast('Document not found.'); return; }
  try {
    const response = await fetch(`/api/documents/${documentId}`);
    const doc = await response.json();
    if (!response.ok) throw new Error(doc.error || 'Document not found.');
    documentRecord = doc;
    document.title = `${doc.filename} — DesFlyer`;
    document.querySelector('#viewer-filename').textContent = doc.filename;
    const ownerType = doc.owner_type || 'employee';
    const ownerLabel = ownerType[0].toUpperCase() + ownerType.slice(1);
    const ownerCode = doc.owner_code || doc.employee_code || '—';
    document.querySelector('#viewer-employee').textContent = doc.employee || 'Unassigned';
    document.querySelector('#viewer-employee-id').textContent = ownerCode;
    document.querySelectorAll('[data-share-document]').forEach((button) => { button.dataset.shareDocument = doc.id; });
    document.querySelector('#info-filename').textContent = doc.filename;
    document.querySelector('#info-employee').textContent = doc.employee || '—';
    document.querySelector('#info-employee-id').textContent = ownerCode;
    document.querySelector('#related-owner-label').textContent = `Related ${ownerLabel}`;
    document.querySelector('#info-designation').textContent = doc.employee_designation || '—';
    document.querySelector('#designation-block').hidden = ownerType !== 'employee';
    document.querySelector('#info-category').textContent = doc.category;
    document.querySelector('#info-format').textContent = doc.format === 'PDF' ? 'PDF Version 1.7' : doc.format;
    document.querySelector('#info-size').textContent = displaySize(doc.file_size);
    document.querySelector('#info-uploaded').textContent = displayDate(doc.uploaded_at);
    document.querySelector('#info-avatar').textContent = (doc.employee || '?').split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
    pageCount = ['JPG', 'JPEG', 'PNG'].includes(doc.format) ? 1 : 5;
    document.querySelector('#page-count').textContent = pageCount;
    setPage(1);

    if (['PDF', 'JPG', 'JPEG', 'PNG'].includes(doc.format)) {
      const previewResponse = await fetch(`/api/documents/${documentId}/preview`);
      if (previewResponse.ok) {
        const blob = await previewResponse.blob();
        const previewUrl = URL.createObjectURL(blob);
        if (doc.format === 'PDF') {
          document.querySelector('.viewer-canvas').classList.add('pdf-native-preview');
          document.querySelector('#pdf-preview').src = previewUrl;
          document.querySelector('#pdf-preview').hidden = false;
          document.querySelector('#mock-document').hidden = true;
        } else {
          document.querySelector('#image-preview').src = previewUrl;
          document.querySelector('#image-preview').hidden = false;
          document.querySelector('#mock-document').hidden = true;
        }
      }
    }
  } catch (error) {
    document.querySelector('#viewer-filename').textContent = 'Unable to load document';
    toast(error.message);
  }
}

document.querySelector('#page-prev').addEventListener('click', () => setPage(page - 1));
document.querySelector('#page-next').addEventListener('click', () => setPage(page + 1));
document.querySelector('#zoom-out').addEventListener('click', () => setZoom(zoom - .1));
document.querySelector('#zoom-in').addEventListener('click', () => setZoom(zoom + .1));
document.querySelector('#fit-page').addEventListener('click', () => setZoom(1));
document.querySelector('#viewer-download').addEventListener('click', downloadDocument);
document.querySelector('#info-download').addEventListener('click', downloadDocument);

loadDocument();
