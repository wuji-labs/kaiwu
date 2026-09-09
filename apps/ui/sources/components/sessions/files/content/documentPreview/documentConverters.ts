import JSZip from 'jszip';
import * as XLSX from 'xlsx';

export function escapeHtml(str: string): string {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

export function sanitizeHtml(html: string): string {
    if (!html) return '';
    return html
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/\son\w+\s*=\s*(?:'[^']*'|"[^"]*"|[^\s>]+)/gi, '')
        .replace(/href\s*=\s*['"]\s*javascript:[^'"]*['"]/gi, 'href="#"');
}

function getBaseDocumentHtml(bodyContent: string, customStyles: string = ''): string {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=3.0, user-scalable=yes">
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 16px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #24292f;
      background-color: #ffffff;
      line-height: 1.5;
    }
    @media (prefers-color-scheme: dark) {
      body {
        color: #c9d1d9;
        background-color: #0d1117;
      }
    }
    ${customStyles}
  </style>
</head>
<body>
  ${bodyContent}
</body>
</html>`;
}

/**
 * Converts XLSX workbook into responsive HTML with CSS-driven multi-sheet tab switching.
 */
export async function convertXlsxToHtml(data: ArrayBuffer | Uint8Array): Promise<string> {
    const workbook = XLSX.read(data, { type: 'array' });
    const sheetNames = workbook.SheetNames ?? [];

    if (sheetNames.length === 0) {
        return getBaseDocumentHtml('<p style="color:#8b949e;text-align:center;margin-top:40px;">No worksheets found in workbook</p>');
    }

    const tabStyles = `
    .xlsx-viewer {
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
    }
    .xlsx-tabs {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      padding-bottom: 12px;
      margin-bottom: 16px;
      border-bottom: 1px solid #d0d7de;
    }
    @media (prefers-color-scheme: dark) {
      .xlsx-tabs { border-bottom-color: #30363d; }
    }
    .xlsx-tab-input {
      display: none;
    }
    .xlsx-tab-label {
      cursor: pointer;
      padding: 6px 14px;
      font-size: 13px;
      font-weight: 500;
      border-radius: 6px;
      border: 1px solid #d0d7de;
      background: #f6f8fa;
      color: #24292f;
      user-select: none;
      transition: all 0.15s ease;
    }
    @media (prefers-color-scheme: dark) {
      .xlsx-tab-label {
        border-color: #30363d;
        background: #21262d;
        color: #c9d1d9;
      }
    }
    ${sheetNames.map((_, idx) => `#tab-${idx}:checked ~ .xlsx-tabs label[for="tab-${idx}"]`).join(', ')} {
      background: #0969da;
      color: #ffffff;
      border-color: #0969da;
    }
    @media (prefers-color-scheme: dark) {
      ${sheetNames.map((_, idx) => `#tab-${idx}:checked ~ .xlsx-tabs label[for="tab-${idx}"]`).join(', ')} {
        background: #1f6feb;
        color: #ffffff;
        border-color: #1f6feb;
      }
    }
    .xlsx-sheet-pane {
      display: none;
      width: 100%;
      overflow-x: auto;
    }
    ${sheetNames.map((_, idx) => `#tab-${idx}:checked ~ #sheet-pane-${idx}`).join(', ')} {
      display: block;
    }
    table {
      border-collapse: collapse;
      width: 100%;
      min-width: 400px;
      font-size: 13px;
    }
    th, td {
      border: 1px solid #d0d7de;
      padding: 6px 10px;
      text-align: left;
      white-space: nowrap;
    }
    @media (prefers-color-scheme: dark) {
      th, td { border-color: #30363d; }
    }
    tr:nth-child(even) {
      background-color: rgba(0, 0, 0, 0.02);
    }
    @media (prefers-color-scheme: dark) {
      tr:nth-child(even) { background-color: rgba(255, 255, 255, 0.02); }
    }
    tr:first-child td {
      font-weight: 600;
      background-color: #f6f8fa;
    }
    @media (prefers-color-scheme: dark) {
      tr:first-child td { background-color: #161b22; }
    }
  `;

    let html = '<div class="xlsx-viewer">';

    // Radio inputs
    sheetNames.forEach((_, idx) => {
        html += `<input type="radio" name="sheet-tab" id="tab-${idx}" class="xlsx-tab-input" ${idx === 0 ? 'checked' : ''}>`;
    });

    // Tab buttons
    if (sheetNames.length > 1) {
        html += '<div class="xlsx-tabs">';
        sheetNames.forEach((name, idx) => {
            html += `<label for="tab-${idx}" class="xlsx-tab-label">${escapeHtml(name)}</label>`;
        });
        html += '</div>';
    }

    // Sheets
    sheetNames.forEach((name, idx) => {
        const sheet = workbook.Sheets[name];
        let tableHtml = '';
        if (sheet) {
            const rawTable = XLSX.utils.sheet_to_html(sheet);
            // Extract table content from raw <html><body><table>...</table></body></html>
            const tableMatch = /<table\b[^>]*>([\s\S]*?)<\/table>/i.exec(rawTable);
            tableHtml = tableMatch ? `<table>${tableMatch[1]}</table>` : '<p style="color:#8b949e;padding:12px;">Empty sheet</p>';
        } else {
            tableHtml = '<p style="color:#8b949e;padding:12px;">Empty sheet</p>';
        }

        html += `<div id="sheet-pane-${idx}" class="xlsx-sheet-pane">${sanitizeHtml(tableHtml)}</div>`;
    });

    html += '</div>';

    return getBaseDocumentHtml(html, tabStyles);
}

/**
 * Converts PPTX presentation into structured slide cards HTML.
 */
export async function convertPptxToHtml(data: ArrayBuffer | Uint8Array): Promise<string> {
    const zip = await JSZip.loadAsync(data);
    const slideFiles = Object.keys(zip.files).filter(f => /^ppt\/slides\/slide[0-9]+\.xml$/.test(f));

    if (slideFiles.length === 0) {
        return getBaseDocumentHtml('<p style="color:#8b949e;text-align:center;margin-top:40px;">No slide content found in presentation</p>');
    }

    // Sort slides in natural numerical order
    slideFiles.sort((a, b) => {
        const numA = parseInt(a.match(/[0-9]+/)?.[0] ?? '0', 10);
        const numB = parseInt(b.match(/[0-9]+/)?.[0] ?? '0', 10);
        return numA - numB;
    });

    const pptxStyles = `
    .pptx-container {
      display: flex;
      flex-direction: column;
      gap: 24px;
      max-width: 760px;
      margin: 0 auto;
      padding: 8px 0;
    }
    .slide-card {
      border: 1px solid #d0d7de;
      border-radius: 12px;
      background: #ffffff;
      box-shadow: 0 2px 8px rgba(0,0,0,0.06);
      overflow: hidden;
    }
    @media (prefers-color-scheme: dark) {
      .slide-card {
        border-color: #30363d;
        background: #161b22;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      }
    }
    .slide-header {
      padding: 10px 16px;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #57606a;
      background: #f6f8fa;
      border-bottom: 1px solid #d0d7de;
    }
    @media (prefers-color-scheme: dark) {
      .slide-header {
        color: #8b949e;
        background: #21262d;
        border-bottom-color: #30363d;
      }
    }
    .slide-body {
      padding: 20px 24px;
      min-height: 120px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .slide-para {
      margin: 0;
      font-size: 15px;
      line-height: 1.6;
    }
    .slide-para.title {
      font-size: 20px;
      font-weight: 600;
      color: #0969da;
      margin-bottom: 6px;
    }
    @media (prefers-color-scheme: dark) {
      .slide-para.title {
        color: #58a6ff;
      }
    }
    .slide-para.bullet {
      padding-left: 18px;
      position: relative;
    }
    .slide-para.bullet::before {
      content: "•";
      position: absolute;
      left: 4px;
      color: #57606a;
    }
  `;

    let html = '<div class="pptx-container">';

    for (let i = 0; i < slideFiles.length; i++) {
        const file = slideFiles[i];
        const slideXml = await zip.files[file].async('text');

        const paras: { text: string; isTitle: boolean; isBullet: boolean }[] = [];
        const pRegex = /<a:p\b[^>]*>([\s\S]*?)<\/a:p>/g;
        let pMatch;
        let pIndex = 0;

        while ((pMatch = pRegex.exec(slideXml)) !== null) {
            const pHtml = pMatch[1];
            const tRegex = /<a:t\b[^>]*>([\s\S]*?)<\/a:t>/g;
            let tMatch;
            let paraText = '';
            while ((tMatch = tRegex.exec(pHtml)) !== null) {
                paraText += tMatch[1];
            }

            const cleanText = paraText.trim();
            if (cleanText.length > 0) {
                paras.push({
                    text: cleanText,
                    isTitle: pIndex === 0 && cleanText.length < 80,
                    isBullet: pIndex > 0,
                });
                pIndex++;
            }
        }

        html += `
      <div class="slide-card">
        <div class="slide-header">Slide ${i + 1} of ${slideFiles.length}</div>
        <div class="slide-body">
    `;

        if (paras.length === 0) {
            html += '<p style="color:#8b949e;margin:0;">(No text content)</p>';
        } else {
            paras.forEach(p => {
                const className = p.isTitle ? 'slide-para title' : p.isBullet ? 'slide-para bullet' : 'slide-para';
                html += `<p class="${className}">${escapeHtml(p.text)}</p>`;
            });
        }

        html += `
        </div>
      </div>
    `;
    }

    html += '</div>';

    return getBaseDocumentHtml(html, pptxStyles);
}

/**
 * Parses OpenXML word/document.xml directly when DOM environment is not available.
 */
async function parseDocxOpenXml(zip: JSZip): Promise<string> {
    const docXmlFile = zip.files['word/document.xml'];
    if (!docXmlFile) {
        return '<p style="color:#8b949e;">Could not locate document.xml in docx package</p>';
    }

    const xml = await docXmlFile.async('text');
    const bodyMatch = /<w:body\b[^>]*>([\s\S]*?)<\/w:body>/.exec(xml);
    if (!bodyMatch) return '<p>Empty document</p>';
    const body = bodyMatch[1];

    let html = '';
    const elemRegex = /<(w:p|w:tbl)\b[^>]*>([\s\S]*?)<\/\1>/g;
    let match;

    while ((match = elemRegex.exec(body)) !== null) {
        const tag = match[1];
        const content = match[2];

        if (tag === 'w:p') {
            const isHeading1 = /<w:pStyle[^>]*w:val=["'](?:Heading1|Title)["']/.test(content);
            const isHeading2 = /<w:pStyle[^>]*w:val=["']Heading2["']/.test(content);
            const isHeading3 = /<w:pStyle[^>]*w:val=["']Heading3["']/.test(content);

            let pText = '';
            const runRegex = /<w:r\b[^>]*>([\s\S]*?)<\/w:r>/g;
            let runMatch;

            while ((runMatch = runRegex.exec(content)) !== null) {
                const runContent = runMatch[1];
                const isBold = /<w:b(\/>|\s[^>]*\/>)/.test(runContent);
                const isItalic = /<w:i(\/>|\s[^>]*\/>)/.test(runContent);

                let text = '';
                const tRegex = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g;
                let tMatch;
                while ((tMatch = tRegex.exec(runContent)) !== null) {
                    text += tMatch[1];
                }

                if (text) {
                    let escaped = escapeHtml(text);
                    if (isBold && isItalic) escaped = `<strong><em>${escaped}</em></strong>`;
                    else if (isBold) escaped = `<strong>${escaped}</strong>`;
                    else if (isItalic) escaped = `<em>${escaped}</em>`;
                    pText += escaped;
                }
            }

            if (pText.trim().length > 0) {
                if (isHeading1) html += `<h1>${pText}</h1>`;
                else if (isHeading2) html += `<h2>${pText}</h2>`;
                else if (isHeading3) html += `<h3>${pText}</h3>`;
                else html += `<p>${pText}</p>`;
            }
        } else if (tag === 'w:tbl') {
            html += '<table border="1">';
            const trRegex = /<w:tr\b[^>]*>([\s\S]*?)<\/w:tr>/g;
            let trMatch;
            while ((trMatch = trRegex.exec(content)) !== null) {
                html += '<tr>';
                const tcRegex = /<w:tc\b[^>]*>([\s\S]*?)<\/w:tc>/g;
                let tcMatch;
                while ((tcMatch = tcRegex.exec(trMatch[1])) !== null) {
                    let tcText = '';
                    const tRegex = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g;
                    let tMatch;
                    while ((tMatch = tRegex.exec(tcMatch[1])) !== null) {
                        tcText += tMatch[1];
                    }
                    html += `<td>${escapeHtml(tcText)}</td>`;
                }
                html += '</tr>';
            }
            html += '</table>';
        }
    }

    return html || '<p style="color:#8b949e;">(Empty document)</p>';
}

/**
 * Converts DOCX document to styled HTML using docx-preview where DOM is present,
 * with pure JSZip OpenXML fallback.
 */
export async function convertDocxToHtml(data: ArrayBuffer | Uint8Array): Promise<string> {
    const docxStyles = `
    .docx-content {
      max-width: 800px;
      margin: 0 auto;
      padding: 12px 16px;
      line-height: 1.6;
    }
    h1, h2, h3, h4 {
      color: #1f2328;
      margin-top: 24px;
      margin-bottom: 16px;
      font-weight: 600;
      line-height: 1.25;
    }
    @media (prefers-color-scheme: dark) {
      h1, h2, h3, h4 { color: #f0f6fc; }
    }
    p { margin-top: 0; margin-bottom: 12px; }
    table {
      border-collapse: collapse;
      width: 100%;
      margin: 16px 0;
    }
    th, td {
      border: 1px solid #d0d7de;
      padding: 8px 12px;
      text-align: left;
    }
    @media (prefers-color-scheme: dark) {
      th, td { border-color: #30363d; }
    }
  `;

    // 1. Try docx-preview if DOM is available
    if (typeof window !== 'undefined' && typeof document !== 'undefined' && typeof document.createElement === 'function') {
        try {
            const docxPreview = await import('docx-preview');
            if (typeof docxPreview.renderAsync === 'function') {
                const bodyContainer = document.createElement('div');
                const styleContainer = document.createElement('div');
                await docxPreview.renderAsync(data, bodyContainer, styleContainer, {
                    inWrapper: false,
                    ignoreWidth: true,
                    ignoreHeight: false,
                    breakPages: true,
                });
                const renderedHtml = styleContainer.innerHTML + bodyContainer.innerHTML;
                return getBaseDocumentHtml(
                    `<div class="docx-content">${sanitizeHtml(renderedHtml)}</div>`,
                    docxStyles
                );
            }
        } catch (err) {
            console.warn('docx-preview renderAsync failed, falling back to OpenXML parser:', err);
        }
    }

    // 2. OpenXML fallback with JSZip
    try {
        const zip = await JSZip.loadAsync(data);
        const openXmlHtml = await parseDocxOpenXml(zip);
        return getBaseDocumentHtml(
            `<div class="docx-content">${sanitizeHtml(openXmlHtml)}</div>`,
            docxStyles
        );
    } catch (err) {
        return getBaseDocumentHtml(`<p style="color:#cf222e;text-align:center;margin-top:30px;">Failed to parse docx document: ${escapeHtml(err instanceof Error ? err.message : String(err))}</p>`);
    }
}
