import * as React from 'react';
import { Platform, View, StyleSheet } from 'react-native';
import { HtmlDocumentPreview } from '@/components/sessions/files/content/documentPreview/HtmlDocumentPreview';

export type PdfPreviewPanelProps = Readonly<{
    uri: string;
    theme: any;
    fileName: string;
}>;

export function PdfPreviewPanel(props: PdfPreviewPanelProps) {
    const { uri, theme, fileName } = props;

    if (Platform.OS === 'web') {
        return (
            <View style={[styles.container, { backgroundColor: theme.colors.surface.base }]}>
                <iframe
                    title={fileName}
                    src={uri}
                    style={{
                        width: '100%',
                        height: '100%',
                        border: 'none',
                        display: 'block',
                    }}
                />
            </View>
        );
    }

    // Native PDF preview using pdf.js inside HtmlDocumentPreview (WebView)
    const nativeHtml = React.useMemo(() => {
        const bg = theme.colors.surface.base;
        const cardBg = theme.colors.surface.elevated;
        const textSec = theme.colors.text.secondary;

        return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=3.0, user-scalable=yes">
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 12px;
      background-color: ${bg};
      display: flex;
      flex-direction: column;
      align-items: center;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    #pdf-container {
      width: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
    }
    .pdf-page-card {
      background: ${cardBg};
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
      border-radius: 6px;
      overflow: hidden;
      max-width: 100%;
    }
    canvas {
      display: block;
      max-width: 100%;
      height: auto !important;
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
  </style>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
</head>
<body>
  <div id="loading">Loading PDF...</div>
  <div id="error"></div>
  <div id="pdf-container"></div>

  <script>
    (async function() {
      const url = ${JSON.stringify(uri)};
      const container = document.getElementById('pdf-container');
      const loading = document.getElementById('loading');
      const errorDiv = document.getElementById('error');

      function showError(msg) {
        loading.style.display = 'none';
        errorDiv.style.display = 'block';
        errorDiv.textContent = msg;
      }

      try {
        if (!window.pdfjsLib) {
          throw new Error('PDF.js library could not be loaded');
        }
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

        const loadingTask = window.pdfjsLib.getDocument(url);
        const pdf = await loadingTask.promise;
        loading.style.display = 'none';

        const numPages = pdf.numPages;
        const targetWidth = Math.min(window.innerWidth - 24, 800);

        for (let pageNum = 1; pageNum <= numPages; pageNum++) {
          const page = await pdf.getPage(pageNum);
          const unscaledViewport = page.getViewport({ scale: 1.0 });
          const scale = targetWidth / unscaledViewport.width;
          const viewport = page.getViewport({ scale: Math.max(scale, 1.5) });

          const card = document.createElement('div');
          card.className = 'pdf-page-card';

          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          canvas.height = viewport.height;
          canvas.width = viewport.width;
          canvas.style.width = targetWidth + 'px';

          card.appendChild(canvas);
          container.appendChild(card);

          await page.render({
            canvasContext: context,
            viewport: viewport
          }).promise;
        }
      } catch (err) {
        showError(err && err.message ? err.message : 'Failed to render PDF');
      }
    })();
  </script>
</body>
</html>`;
    }, [theme, uri]);

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.surface.base }]}>
            <HtmlDocumentPreview html={nativeHtml} />
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
