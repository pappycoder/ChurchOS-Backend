import { join } from 'path';

export const PDF_COLORS = {
  navy: '#14243C',
  blue: '#2563EB',
  ink: '#243449',
  muted: '#64748B',
  line: '#E2E8F0',
  soft: '#F4F7FC',
  green: '#047857',
};

/** Assets are copied into dist by Nest, so no network request is needed. */
const asset = (name: string) => join(__dirname, '../../assets/pdf', name);

export function preparePdf(doc: PDFKit.PDFDocument): void {
  doc.registerFont('ChurchOSSans', asset('DejaVuSans.ttf'));
  doc.registerFont('ChurchOSSans-Bold', asset('DejaVuSans-Bold.ttf'));
  doc.font('ChurchOSSans');
}

export function drawPdfHeader(doc: PDFKit.PDFDocument, label: string): void {
  const { x, y } = doc;
  doc.save();
  doc.rect(0, 0, doc.page.width, 112).fill(PDF_COLORS.navy);
  doc.rect(0, 112, doc.page.width, 4).fill(PDF_COLORS.blue);
  doc.image(asset('churchos-lockup-light.png'), 40, 16, { fit: [145, 80] });
  doc
    .font('ChurchOSSans-Bold')
    .fontSize(13)
    .fillColor('#FFFFFF')
    .text(label.toUpperCase(), 280, 51, {
      width: doc.page.width - 330,
      align: 'right',
      lineBreak: false,
    });
  doc.restore();
  doc.x = x;
  doc.y = y;
}

export function drawPdfFooters(doc: PDFKit.PDFDocument, generatedAt: Date): void {
  const pages = doc.bufferedPageRange();
  for (let i = pages.start; i < pages.start + pages.count; i++) {
    doc.switchToPage(i);
    const { width, height } = doc.page;
    const bottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.save();
    doc
      .moveTo(50, height - 58)
      .lineTo(width - 50, height - 58)
      .lineWidth(0.5)
      .stroke(PDF_COLORS.line);
    doc
      .font('ChurchOSSans')
      .fontSize(8)
      .fillColor(PDF_COLORS.muted)
      .text(
        `ChurchOS  ·  ${generatedAt.toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' })}`,
        50,
        height - 43,
        { lineBreak: false },
      );
    doc.text(`${i - pages.start + 1} / ${pages.count}`, width - 100, height - 43, {
      width: 50,
      align: 'right',
      lineBreak: false,
    });
    doc.restore();
    doc.page.margins.bottom = bottomMargin;
  }
}
