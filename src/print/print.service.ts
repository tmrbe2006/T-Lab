import JsBarcode from 'jsbarcode';
import { authService } from '../auth/auth.service';
import { showToast } from '../components/toast';
import { i18n } from '../i18n';
import { permissionsRepository } from '../repositories';

export type PrintFormatType = 'A4' | 'THERMAL_80MM' | 'BARCODE_LABEL';

export class PrintService {
  /**
   * Generates a Code128 SVG string for any barcode value using JsBarcode.
   */
  generateBarcodeSvg(barcodeValue: string): string {
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    try {
      JsBarcode(svg, barcodeValue || 'BC20260001', {
        format: 'CODE128',
        width: 1.7,
        height: 44,
        displayValue: true,
        fontSize: 12,
        margin: 4,
      });
    } catch {
      svg.innerHTML = `<text x="10" y="20">${barcodeValue}</text>`;
    }
    return svg.outerHTML;
  }

  /**
   * Executes printing via both an isolated iframe and window.print()
   * while displaying an interactive on-screen Print Preview Studio Modal
   * so printing works reliably inside sandboxed preview iframes and standalone browsers.
   */
  private openPrintPreviewAndExecute(
    format: PrintFormatType,
    documentTitle: string,
    sheetInnerHtml: string
  ): void {
    const printRoot = document.getElementById('print-root');
    if (printRoot) {
      printRoot.innerHTML = sheetInnerHtml;
    }

    const modalRoot = document.getElementById('modal-root');
    if (!modalRoot) {
      window.print();
      return;
    }

    const widthClass =
      format === 'A4'
        ? 'max-w-4xl w-full'
        : format === 'THERMAL_80MM'
        ? 'max-w-[340px] w-full'
        : 'max-w-[280px] w-full';

    const formatBadge =
      format === 'A4'
        ? i18n.bi('تقرير رسمي مقاس A4', 'Official A4 Document')
        : format === 'THERMAL_80MM'
        ? i18n.bi('إيصال حراري 80mm', '80mm Thermal Receipt')
        : i18n.bi('ملصق باركود عينة Code128', 'Code128 Barcode Sticker');

    modalRoot.innerHTML = `
      <div class="fixed inset-0 z-50 flex flex-col bg-slate-950/80 backdrop-blur-xs p-4 overflow-y-auto no-print">
        <!-- Top Preview Control Bar -->
        <div class="max-w-4xl w-full mx-auto rounded-t-xl bg-slate-900 border border-slate-700 px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 text-white shadow-xl">
          <div>
            <div class="text-xs font-semibold text-sky-400">${formatBadge}</div>
            <h3 class="text-sm font-bold text-white">${documentTitle}</h3>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <button
              id="preview-direct-print-btn"
              type="button"
              class="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500 cursor-pointer"
            >
              🖨 ${i18n.bi('إرسال للطابعة الآن (Print)', 'Send to Printer (Print)')}
            </button>
            <button
              id="preview-download-html-btn"
              type="button"
              class="rounded-lg border border-slate-600 bg-slate-800 px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 cursor-pointer"
            >
              ⬇ ${i18n.bi('تنزيل نسخة للطباعة', 'Download Printable File')}
            </button>
            <button
              id="preview-close-btn"
              type="button"
              class="rounded-lg bg-rose-600/90 px-3.5 py-2 text-xs font-bold text-white hover:bg-rose-600 cursor-pointer"
            >
              ✕ ${i18n.bi('إغلاق المعاينة', 'Close')}
            </button>
          </div>
        </div>

        <!-- Paper Canvas Container -->
        <div class="max-w-4xl w-full mx-auto bg-slate-800/90 border-x border-b border-slate-700 rounded-b-xl p-6 flex justify-center overflow-x-auto shadow-2xl">
          <div class="print-paper-sheet ${widthClass} rounded-lg shadow-xl p-6 border border-slate-300">
            ${sheetInnerHtml}
          </div>
        </div>
      </div>
    `;

    const triggerNativePrint = () => {
      try {
        // Create a dedicated print iframe for reliable printing inside nested preview containers
        const existingFrame = document.getElementById('dedicated-print-iframe') as HTMLIFrameElement | null;
        if (existingFrame) existingFrame.remove();

        const iframe = document.createElement('iframe');
        iframe.id = 'dedicated-print-iframe';
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '1px';
        iframe.style.height = '1px';
        iframe.style.border = '0';
        iframe.style.opacity = '0';
        document.body.appendChild(iframe);

        const doc = iframe.contentWindow?.document;
        if (doc) {
          doc.open();
          doc.write(`
            <!doctype html>
            <html lang="${i18n.getLang()}" dir="${i18n.getDirection()}">
              <head>
                <meta charset="UTF-8" />
                <title>${documentTitle}</title>
                <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&family=JetBrains+Mono:wght@400;600&family=Plus+Jakarta+Sans:wght@400;600;700&display=swap" rel="stylesheet" />
                <style>
                  body {
                    font-family: 'Cairo', 'Plus Jakarta Sans', sans-serif;
                    color: #000;
                    background: #fff;
                    margin: 0;
                    padding: 12px;
                  }
                  .tabular-nums { font-family: 'JetBrains Mono', monospace; }
                  table.print-table { width: 100%; border-collapse: collapse; margin-top: 8px; }
                  table.print-table th, table.print-table td { border: 1px solid #94a3b8; padding: 6px 8px; text-align: start; font-size: 12px; }
                  table.print-table th { background-color: #f1f5f9; font-weight: 700; }
                </style>
              </head>
              <body>
                ${sheetInnerHtml}
              </body>
            </html>
          `);
          doc.close();

          setTimeout(() => {
            try {
              iframe.contentWindow?.focus();
              iframe.contentWindow?.print();
            } catch {
              window.print();
            }
          }, 200);
        } else {
          window.print();
        }
      } catch {
        window.print();
      }
      showToast(
        i18n.bi('تم تجهيز المستند وإرساله لأمر الطباعة', 'Document prepared and sent to printer'),
        'success'
      );
    };

    document.getElementById('preview-direct-print-btn')?.addEventListener('click', triggerNativePrint);

    document.getElementById('preview-download-html-btn')?.addEventListener('click', () => {
      const fullHtml = `<!doctype html>
<html lang="${i18n.getLang()}" dir="${i18n.getDirection()}">
<head>
  <meta charset="UTF-8" />
  <title>${documentTitle}</title>
  <style>
    body { font-family: 'Cairo', sans-serif; padding: 20px; color: #0f172a; background: #fff; }
    table.print-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    table.print-table th, table.print-table td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: start; font-size: 12px; }
    table.print-table th { background: #f1f5f9; }
  </style>
</head>
<body onload="window.print()">
  ${sheetInnerHtml}
</body>
</html>`;
      const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${documentTitle.replace(/[^a-zA-Z0-9\u0600-\u06FF_-]/g, '_')}.html`;
      a.click();
      URL.revokeObjectURL(url);
      showToast(i18n.bi('تم تنزيل ملف التقرير الجاهز للطباعة', 'Printable report downloaded'), 'success');
    });

    document.getElementById('preview-close-btn')?.addEventListener('click', () => {
      modalRoot.innerHTML = '';
    });
  }

  /**
   * Prints an official A4 Report with Lab Header, Timestamp, Printed-By user, and custom HTML body.
   */
  async printA4(title: string, contentHtml: string, subtitle = ''): Promise<void> {
    const settings = await permissionsRepository.getSettings();
    const user = authService.getCurrentUser();
    const nowStr = new Date().toLocaleString(i18n.getLang() === 'ar' ? 'ar-EG' : 'en-US');
    const labName = i18n.bi(
      settings?.labNameAr || 'مختبرات الشفاء التخصصية',
      settings?.labNameEn || 'Al-Shifa Specialized Medical Laboratories'
    );
    const branchName = i18n.bi(
      settings?.branchNameAr || 'الفرع الرئيسي',
      settings?.branchNameEn || 'Main Branch'
    );
    const address = i18n.bi(settings?.addressAr || '', settings?.addressEn || '');
    const footer = i18n.bi(settings?.printFooterAr || '', settings?.printFooterEn || '');

    const sheetHtml = `
      <div class="print-a4" dir="${i18n.getDirection()}">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #0f172a; padding-bottom:10px; margin-bottom:14px;">
          <div>
            <h1 style="font-size:18px; font-weight:700; margin:0; color:#0f172a;">${labName}</h1>
            <p style="font-size:12px; margin:2px 0; color:#334155;">${branchName} · ${address}</p>
            <p style="font-size:11px; margin:2px 0; color:#475569;">Tel: ${settings?.phone || '19014'}</p>
          </div>
          <div style="text-align:end; font-size:11px; color:#334155;">
            <div><strong>${i18n.dict.common.printedAt}:</strong> ${nowStr}</div>
            <div><strong>${i18n.dict.common.printedBy}:</strong> ${user ? i18n.bi(user.fullNameAr, user.fullNameEn) : 'System'} (${user?.role || ''})</div>
          </div>
        </div>
        <div style="margin-bottom:12px;">
          <h2 style="font-size:15px; font-weight:700; margin:0; color:#0f172a;">${title}</h2>
          ${subtitle ? `<p style="font-size:11px; color:#475569; margin:2px 0 0 0;">${subtitle}</p>` : ''}
        </div>
        <div>${contentHtml}</div>
        <div style="margin-top:24px; padding-top:8px; border-top:1px solid #cbd5e1; font-size:10px; color:#475569; display:flex; justify-content:space-between;">
          <span>${footer}</span>
          <span>MedLab Pro v1.0</span>
        </div>
      </div>
    `;

    await authService.logAudit(`طباعة A4: ${title}`, 'printing', 'PRINT-A4', subtitle);
    this.openPrintPreviewAndExecute('A4', title, sheetHtml);
  }

  /**
   * Prints an 80mm Thermal Receipt (Payment Receipt / Request Summary / Sample Receipt).
   */
  async printThermal80mm(title: string, bodyHtml: string, referenceCode: string): Promise<void> {
    const settings = await permissionsRepository.getSettings();
    const user = authService.getCurrentUser();
    const nowStr = new Date().toLocaleString(i18n.getLang() === 'ar' ? 'ar-EG' : 'en-US');
    const labName = i18n.bi(
      settings?.labNameAr || 'مختبرات الشفاء التخصصية',
      settings?.labNameEn || 'Al-Shifa Medical Labs'
    );
    const barcodeSvg = this.generateBarcodeSvg(referenceCode);

    const sheetHtml = `
      <div class="print-thermal" dir="${i18n.getDirection()}">
        <div style="text-align:center; border-bottom:1px dashed #000; padding-bottom:6px; margin-bottom:8px;">
          <div style="font-weight:700; font-size:13px;">${labName}</div>
          <div style="font-size:10px;">${settings?.phone || '19014'}</div>
          <div style="font-weight:700; margin-top:4px;">${title}</div>
        </div>
        <div style="font-size:11px; margin-bottom:8px; line-height:1.6;">
          ${bodyHtml}
        </div>
        <div style="text-align:center; margin-top:8px; border-top:1px dashed #000; padding-top:6px;">
          <div style="display:flex; justify-content:center;">${barcodeSvg}</div>
          <div style="font-size:9px; margin-top:4px;">
            ${nowStr} · ${user?.username || 'admin'}
          </div>
        </div>
      </div>
    `;

    await authService.logAudit(`طباعة إيصال حراري 80mm: ${title}`, 'printing', referenceCode);
    this.openPrintPreviewAndExecute('THERMAL_80MM', `${title} (${referenceCode})`, sheetHtml);
  }

  /**
   * Prints a Sample / Request Barcode Label (Code128) with Request #, Patient Name, Date, Sample Type, Test Count, and Branch Name.
   */
  async printBarcodeLabel(params: {
    barcode: string;
    requestNumber: string;
    patientName: string;
    date: string;
    sampleType: string;
    testsSummary: string;
  }): Promise<void> {
    const settings = await permissionsRepository.getSettings();
    const branchName = i18n.bi(
      settings?.branchNameAr || 'مختبرات الشفاء - الفرع الرئيسي',
      settings?.branchNameEn || 'Al-Shifa Labs - Main Branch'
    );
    const svgHtml = this.generateBarcodeSvg(params.barcode);

    const sheetHtml = `
      <div class="print-barcode" dir="${i18n.getDirection()}" style="text-align:center;">
        <div style="font-weight:700; font-size:10px; margin-bottom:2px;">${branchName}</div>
        <div style="font-weight:700; font-size:11px;">${params.patientName}</div>
        <div style="font-size:10px;">${params.requestNumber} · ${params.date}</div>
        <div style="margin:4px 0; display:flex; justify-content:center;">${svgHtml}</div>
        <div style="font-size:10px; font-weight:600;">${params.sampleType} | ${params.testsSummary}</div>
      </div>
    `;

    await authService.logAudit(`طباعة ملصق باركود عينة: ${params.barcode}`, 'printing', params.requestNumber, params.patientName);
    this.openPrintPreviewAndExecute('BARCODE_LABEL', `${params.requestNumber} - ${params.patientName}`, sheetHtml);
  }

  /**
   * Convenience wrapper for A4 HTML document printing.
   */
  async printHtmlDocument(title: string, contentHtml: string, subtitle = ''): Promise<void> {
    return this.printA4(title, contentHtml, subtitle);
  }

  /**
   * Convenience wrapper for sample/inventory barcode label printing.
   */
  async printSampleBarcodeLabel(params: {
    labName?: string;
    patientName: string;
    requestNumber: string;
    sampleType: string;
    barcodeValue: string;
    date: string;
  }): Promise<void> {
    return this.printBarcodeLabel({
      barcode: params.barcodeValue,
      requestNumber: params.requestNumber,
      patientName: params.patientName,
      date: params.date,
      sampleType: params.sampleType,
      testsSummary: params.labName || 'Lab Stock',
    });
  }
}

export const printService = new PrintService();

