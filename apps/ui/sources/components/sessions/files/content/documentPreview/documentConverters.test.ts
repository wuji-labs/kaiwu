import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import {
    convertDocxToHtml,
    convertXlsxToHtml,
    convertPptxToHtml,
    escapeHtml,
    sanitizeHtml,
} from './documentConverters';

describe('documentConverters', () => {
    describe('escapeHtml & sanitizeHtml', () => {
        it('escapes html entities correctly', () => {
            const raw = '<div class="test" data-val=\'abc\'>Foo & Bar</div>';
            const escaped = escapeHtml(raw);
            expect(escaped).toBe('&lt;div class=&quot;test&quot; data-val=&#039;abc&#039;&gt;Foo &amp; Bar&lt;/div&gt;');
        });

        it('removes script tags and inline event handlers in sanitizeHtml', () => {
            const dangerous = '<div>Hello<script>alert("XSS")</script><img src="x" onerror="alert(1)" /><a href="javascript:alert(1)">Click</a></div>';
            const clean = sanitizeHtml(dangerous);
            expect(clean).not.toContain('<script');
            expect(clean).not.toContain('alert("XSS")');
            expect(clean).not.toContain('onerror');
            expect(clean).not.toContain('javascript:');
        });
    });

    describe('convertXlsxToHtml', () => {
        it('converts multi-sheet workbook into tabbed HTML tables without script tags', async () => {
            const wb = XLSX.utils.book_new();
            const ws1 = XLSX.utils.aoa_to_sheet([
                ['Project', 'Status', 'Risk'],
                ['Kaiwu <Beta>', 'In Progress', 'Low & Manageable'],
            ]);
            const ws2 = XLSX.utils.aoa_to_sheet([
                ['Metric', 'Value'],
                ['Performance', '99.9%'],
            ]);
            XLSX.utils.book_append_sheet(wb, ws1, 'Overview');
            XLSX.utils.book_append_sheet(wb, ws2, 'Metrics');

            const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
            const html = await convertXlsxToHtml(buffer);

            expect(html).toContain('Overview');
            expect(html).toContain('Metrics');
            expect(html).toContain('Kaiwu &lt;Beta&gt;');
            expect(html).toContain('Low &amp; Manageable');
            expect(html).toContain('Performance');
            expect(html).toContain('99.9%');
            expect(html).toContain('<input type="radio" name="sheet-tab" id="tab-0" class="xlsx-tab-input" checked>');
            expect(html).not.toContain('<script');
        });
    });

    describe('convertPptxToHtml', () => {
        it('converts pptx slides into structured slide cards with escaped text', async () => {
            const zip = new JSZip();
            zip.file(
                'ppt/slides/slide1.xml',
                `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
                    <p:cSld><p:spTree><p:sp><p:txBody>
                        <a:p><a:r><a:t>Kaiwu Slide 1: Welcome & Overview</a:t></a:r></a:p>
                        <a:p><a:r><a:t>First bullet point with <special> characters</a:t></a:r></a:p>
                    </p:txBody></p:sp></p:spTree></p:cSld>
                </p:sld>`
            );
            zip.file(
                'ppt/slides/slide2.xml',
                `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
                    <p:cSld><p:spTree><p:sp><p:txBody>
                        <a:p><a:r><a:t>Kaiwu Slide 2: Architecture Details</a:t></a:r></a:p>
                        <a:p><a:r><a:t>Second bullet point</a:t></a:r></a:p>
                    </p:txBody></p:sp></p:spTree></p:cSld>
                </p:sld>`
            );

            const buffer = await zip.generateAsync({ type: 'arraybuffer' });
            const html = await convertPptxToHtml(buffer);

            expect(html).toContain('Slide 1 of 2');
            expect(html).toContain('Kaiwu Slide 1: Welcome &amp; Overview');
            expect(html).toContain('First bullet point with &lt;special&gt; characters');
            expect(html).toContain('Slide 2 of 2');
            expect(html).toContain('Kaiwu Slide 2: Architecture Details');
            expect(html).toContain('Second bullet point');
            expect(html).not.toContain('<script');
        });
    });

    describe('convertDocxToHtml', () => {
        it('converts docx document into semantic HTML with headings, formatting, and tables', async () => {
            const zip = new JSZip();
            zip.file(
                '[Content_Types].xml',
                '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'
            );
            zip.file(
                '_rels/.rels',
                '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'
            );
            zip.file(
                'word/document.xml',
                `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
                    <w:body>
                        <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Project Specification & Goals</w:t></w:r></w:p>
                        <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Important: </w:t></w:r><w:r><w:rPr><w:i/></w:rPr><w:t>All tests must pass</w:t></w:r></w:p>
                        <w:tbl>
                            <w:tr>
                                <w:tc><w:p><w:r><w:t>Item <1></w:t></w:r></w:p></w:tc>
                                <w:tc><w:p><w:r><w:t>Value & Notes</w:t></w:r></w:p></w:tc>
                            </w:tr>
                        </w:tbl>
                    </w:body>
                </w:document>`
            );

            const buffer = await zip.generateAsync({ type: 'arraybuffer' });
            const html = await convertDocxToHtml(buffer);

            expect(html).toContain('Project Specification &amp; Goals');
            expect(html).toContain('<strong>Important: </strong>');
            expect(html).toContain('<em>All tests must pass</em>');
            expect(html).toContain('Item &lt;1&gt;');
            expect(html).toContain('Value &amp; Notes');
            expect(html).toContain('<table');
            expect(html).not.toContain('<script');
        });
    });
});
