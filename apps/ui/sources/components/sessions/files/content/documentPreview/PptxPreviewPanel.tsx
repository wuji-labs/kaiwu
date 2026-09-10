import * as React from 'react';
import { View, StyleSheet } from 'react-native';
import { HtmlDocumentPreview } from '@/components/sessions/files/content/documentPreview/HtmlDocumentPreview';

export type PptxPreviewPanelProps = Readonly<{
    uri: string;
    theme: any;
    fileName: string;
}>;

export function PptxPreviewPanel(props: PptxPreviewPanelProps) {
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
      align-items: center;
    }
    #notice {
      background: rgba(0, 102, 204, 0.08);
      color: ${accent};
      padding: 8px 16px;
      border-radius: 6px;
      font-size: 13px;
      margin-bottom: 20px;
      text-align: center;
      max-width: 720px;
      width: 100%;
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
    #slides-container {
      display: flex;
      flex-direction: column;
      gap: 20px;
      width: 100%;
      max-width: 760px;
    }
    .slide-card {
      background: ${cardBg};
      border: 1px solid ${border};
      border-radius: 10px;
      padding: 24px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.05);
    }
    .slide-header {
      font-size: 12px;
      font-weight: 600;
      color: ${textSec};
      border-bottom: 1px solid ${border};
      padding-bottom: 8px;
      margin-bottom: 16px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .slide-body {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .slide-paragraph {
      font-size: 15px;
      line-height: 1.5;
      margin: 0;
    }
    .slide-image {
      max-width: 100%;
      border-radius: 6px;
      margin-top: 8px;
    }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js"></script>
</head>
<body>
  <div id="notice">ℹ️ PPTX 为结构化文本预览 (Structured Text Preview)</div>
  <div id="loading">Loading presentation...</div>
  <div id="error"></div>
  <div id="slides-container" style="display: none;"></div>

  <script>
    (async function() {
      const url = ${JSON.stringify(uri)};
      const loading = document.getElementById('loading');
      const errorDiv = document.getElementById('error');
      const slidesContainer = document.getElementById('slides-container');

      function showError(msg) {
        loading.style.display = 'none';
        errorDiv.style.display = 'block';
        errorDiv.textContent = msg;
      }

      function escapeHtml(text) {
        return text
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;');
      }

      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error('Failed to fetch presentation: ' + res.statusText);
        const arrayBuffer = await res.arrayBuffer();

        if (!window.JSZip) throw new Error('JSZip library unavailable');
        const zip = await window.JSZip.loadAsync(arrayBuffer);

        // Find all slides: ppt/slides/slide1.xml, slide2.xml ...
        const slideFiles = [];
        zip.forEach((relativePath, file) => {
          if (/^ppt\/slides\/slide\d+\.xml$/i.test(relativePath)) {
            slideFiles.push(relativePath);
          }
        });

        // Sort slide files numerically
        slideFiles.sort((a, b) => {
          const numA = parseInt(a.match(/slide(\d+)\.xml/i)[1], 10);
          const numB = parseInt(b.match(/slide(\d+)\.xml/i)[1], 10);
          return numA - numB;
        });

        if (slideFiles.length === 0) {
          throw new Error('No slide content found in presentation');
        }

        const parser = new DOMParser();

        for (let i = 0; i < slideFiles.length; i++) {
          const path = slideFiles[i];
          const xmlText = await zip.file(path).async('string');
          const xmlDoc = parser.parseFromString(xmlText, 'application/xml');

          // Extract paragraphs and text: a:p -> a:t
          const pNodes = xmlDoc.getElementsByTagNameNS('*', 'p');
          const paragraphs = [];

          for (let p of pNodes) {
            const tNodes = p.getElementsByTagNameNS('*', 't');
            let pText = '';
            for (let t of tNodes) {
              pText += t.textContent;
            }
            if (pText.trim()) {
              paragraphs.push(pText.trim());
            }
          }

          const card = document.createElement('div');
          card.className = 'slide-card';

          const header = document.createElement('div');
          header.className = 'slide-header';
          header.textContent = 'Slide ' + (i + 1) + ' / ' + slideFiles.length;
          card.appendChild(header);

          const body = document.createElement('div');
          body.className = 'slide-body';

          if (paragraphs.length === 0) {
            const emptyNotice = document.createElement('p');
            emptyNotice.className = 'slide-paragraph';
            emptyNotice.style.color = '${textSec}';
            emptyNotice.style.fontStyle = 'italic';
            emptyNotice.textContent = '(No text content on this slide)';
            body.appendChild(emptyNotice);
          } else {
            paragraphs.forEach(text => {
              const p = document.createElement('p');
              p.className = 'slide-paragraph';
              p.textContent = text;
              body.appendChild(p);
            });
          }

          card.appendChild(body);
          slidesContainer.appendChild(card);
        }

        loading.style.display = 'none';
        slidesContainer.style.display = 'flex';
      } catch (err) {
        showError(err && err.message ? err.message : 'Failed to preview PowerPoint presentation');
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
