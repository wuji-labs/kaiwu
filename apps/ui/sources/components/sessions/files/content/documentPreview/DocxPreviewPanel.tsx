import * as React from 'react';
import { View, StyleSheet } from 'react-native';
import { HtmlDocumentPreview } from '@/components/sessions/files/content/documentPreview/HtmlDocumentPreview';

export type DocxPreviewPanelProps = Readonly<{
    uri: string;
    theme: any;
    fileName: string;
}>;

export function DocxPreviewPanel(props: DocxPreviewPanelProps) {
    const { uri, theme } = props;

    const html = React.useMemo(() => {
        const bg = theme.colors.surface.base;
        const cardBg = theme.colors.surface.elevated;
        const textPri = theme.colors.text.primary;
        const textSec = theme.colors.text.secondary;
        const border = theme.colors.border.default;

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
      align-items: center;
    }
    #loading {
      color: ${textSec};
      font-size: 14px;
      margin-top: 30px;
    }
    #error {
      color: #ff5252;
      font-size: 14px;
      margin-top: 30px;
      display: none;
      text-align: center;
      padding: 0 16px;
    }
    #docx-container {
      width: 100%;
      max-width: 860px;
      background: ${cardBg};
      padding: 24px;
      border-radius: 8px;
      border: 1px solid ${border};
      box-shadow: 0 2px 8px rgba(0,0,0,0.06);
      overflow-x: auto;
    }
    /* docx-preview styling overrides */
    .docx-wrapper {
      background: transparent !important;
      padding: 0 !important;
    }
    .docx-wrapper > section.docx {
      background: transparent !important;
      box-shadow: none !important;
      padding: 0 !important;
      margin-bottom: 0 !important;
      color: inherit !important;
    }
    table {
      border-collapse: collapse;
      max-width: 100%;
    }
    td, th {
      border: 1px solid ${border};
      padding: 6px 10px;
    }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/docx-preview@0.3.3/dist/docx-preview.min.js"></script>
</head>
<body>
  <div id="loading">Loading document...</div>
  <div id="error"></div>
  <div id="docx-container" style="display: none;"></div>

  <script>
    (async function() {
      const url = ${JSON.stringify(uri)};
      const container = document.getElementById('docx-container');
      const loading = document.getElementById('loading');
      const errorDiv = document.getElementById('error');

      function showError(msg) {
        loading.style.display = 'none';
        errorDiv.style.display = 'block';
        errorDiv.textContent = msg;
      }

      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error('Failed to fetch document: ' + res.statusText);
        const blob = await res.blob();

        if (window.docx && typeof window.docx.renderAsync === 'function') {
          await window.docx.renderAsync(blob, container, null, {
            inWrapper: false,
            ignoreWidth: true,
            ignoreHeight: true
          });
          loading.style.display = 'none';
          container.style.display = 'block';
        } else {
          throw new Error('docx-preview library unavailable');
        }
      } catch (err) {
        showError(err && err.message ? err.message : 'Failed to preview Word document');
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
