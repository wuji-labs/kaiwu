import * as React from 'react';
import { View, StyleSheet } from 'react-native';
import { HtmlDocumentPreview } from '@/components/sessions/files/content/documentPreview/HtmlDocumentPreview';

export type XlsxPreviewPanelProps = Readonly<{
    uri: string;
    theme: any;
    fileName: string;
}>;

export function XlsxPreviewPanel(props: XlsxPreviewPanelProps) {
    const { uri, theme } = props;

    const html = React.useMemo(() => {
        const bg = theme.colors.surface.base;
        const cardBg = theme.colors.surface.elevated;
        const textPri = theme.colors.text.primary;
        const textSec = theme.colors.text.secondary;
        const border = theme.colors.border.default;
        const accent = theme.colors.accent?.primary ?? '#0066cc';

        return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 16px;
      background-color: ${bg};
      color: ${textPri};
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
    }
    #loading {
      color: ${textSec};
      font-size: 14px;
      margin: 30px auto;
      text-align: center;
    }
    #error {
      color: #ff5252;
      font-size: 14px;
      margin: 30px auto;
      display: none;
      text-align: center;
      padding: 0 16px;
    }
    #sheet-tabs {
      display: flex;
      gap: 4px;
      border-bottom: 1px solid ${border};
      padding-bottom: 4px;
      margin-bottom: 12px;
      overflow-x: auto;
      flex-shrink: 0;
    }
    .sheet-tab {
      padding: 6px 14px;
      border-radius: 6px 6px 0 0;
      background: transparent;
      border: 1px solid transparent;
      color: ${textSec};
      font-size: 13px;
      cursor: pointer;
      user-select: none;
      white-space: nowrap;
    }
    .sheet-tab.active {
      background: ${cardBg};
      border-color: ${border};
      border-bottom-color: ${cardBg};
      color: ${accent};
      font-weight: 600;
    }
    #table-container {
      flex: 1;
      overflow: auto;
      background: ${cardBg};
      border: 1px solid ${border};
      border-radius: 6px;
    }
    table {
      border-collapse: collapse;
      width: 100%;
      font-size: 13px;
    }
    th, td {
      border: 1px solid ${border};
      padding: 6px 12px;
      text-align: left;
      white-space: nowrap;
    }
    th {
      background: rgba(0,0,0,0.04);
      font-weight: 600;
      position: sticky;
      top: 0;
      z-index: 1;
    }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script>
</head>
<body>
  <div id="loading">Loading spreadsheet...</div>
  <div id="error"></div>
  <div id="sheet-tabs" style="display: none;"></div>
  <div id="table-container" style="display: none;"></div>

  <script>
    (async function() {
      const url = ${JSON.stringify(uri)};
      const loading = document.getElementById('loading');
      const errorDiv = document.getElementById('error');
      const sheetTabs = document.getElementById('sheet-tabs');
      const tableContainer = document.getElementById('table-container');

      function showError(msg) {
        loading.style.display = 'none';
        errorDiv.style.display = 'block';
        errorDiv.textContent = msg;
      }

      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error('Failed to fetch spreadsheet: ' + res.statusText);
        const arrayBuffer = await res.arrayBuffer();

        if (!window.XLSX || typeof window.XLSX.read !== 'function') {
          throw new Error('XLSX parser unavailable');
        }

        const workbook = window.XLSX.read(arrayBuffer, { type: 'array' });
        const sheetNames = workbook.SheetNames;
        if (!sheetNames || sheetNames.length === 0) {
          throw new Error('No sheets found in workbook');
        }

        function renderSheet(name) {
          const sheet = workbook.Sheets[name];
          const html = window.XLSX.utils.sheet_to_html(sheet, { editable: false });
          tableContainer.innerHTML = html;
        }

        sheetTabs.innerHTML = '';
        sheetNames.forEach((name, idx) => {
          const tab = document.createElement('button');
          tab.className = 'sheet-tab' + (idx === 0 ? ' active' : '');
          tab.textContent = name;
          tab.onclick = () => {
            document.querySelectorAll('.sheet-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            renderSheet(name);
          };
          sheetTabs.appendChild(tab);
        });

        renderSheet(sheetNames[0]);
        loading.style.display = 'none';
        sheetTabs.style.display = 'flex';
        tableContainer.style.display = 'block';
      } catch (err) {
        showError(err && err.message ? err.message : 'Failed to preview Excel document');
      }
    })();
  </script>
</body>
</html>`;
    }, [theme, uri]);

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.surface.base }]}>
            <HtmlDocumentPreview html={html} />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        width: '100%',
        height: '100%',
        minHeight: 0,
    },
});
