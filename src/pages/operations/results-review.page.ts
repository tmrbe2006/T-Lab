import { authService } from '../../auth/auth.service';
import { showToast } from '../../components/common';
import { can, enforcePermission } from '../../guards/permission.guard';
import { i18n } from '../../i18n';
import { printService } from '../../print/print.service';
import {
  patientsRepository,
  requestsRepository,
  testsRepository,
} from '../../repositories';

export async function renderResultReviewPage(container: HTMLElement): Promise<void> {
  const user = authService.getCurrentUser();
  let [results, patients, tests] = await Promise.all([
    requestsRepository.getAllResults(),
    patientsRepository.getAll(),
    testsRepository.getAllTests(),
  ]);
  const patMap = new Map(patients.map((p) => [p.id, p]));
  const tstMap = new Map(tests.map((t) => [t.id, t]));

  const renderView = () => {
    const canApprove = can(user, 'approve', 'resultReview');
    const canPrint = can(user, 'print', 'resultReview');

    container.innerHTML = `
      <div class="space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <h1 class="text-xl font-bold text-slate-900">${i18n.dict.nav.resultReview}</h1>
            <p class="text-xs text-slate-500 mt-0.5">${i18n.bi('مراجعة النتائج الطبية، الاعتماد الفردي أو الجماعي، وطباعة التقرير النهائي المعتمد A4', 'Review lab results, single or bulk medical approval, and print official A4 medical report')}</p>
          </div>
          <div class="flex items-center gap-2">
            ${canPrint ? `<button id="rev-print-list" type="button" class="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">${i18n.dict.actions.print}</button>` : ''}
            ${
              canApprove
                ? `<button id="rev-bulk-approve" type="button" class="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 cursor-pointer">
                    ✓ ${i18n.bi('اعتماد جماعي لكافة النتائج بانتظار المراجعة', 'Bulk Approve All Pending Results')}
                  </button>`
                : ''
            }
          </div>
        </div>

        <div class="rounded-xl bg-white border border-slate-200 overflow-x-auto">
          <table class="w-full text-xs text-start">
            <thead>
              <tr class="border-b border-slate-200 bg-slate-50 text-slate-600">
                <th class="py-3 px-3 text-start">${i18n.bi('المريض', 'Patient')}</th>
                <th class="py-3 px-3 text-start">${i18n.bi('التحليل', 'Test')}</th>
                <th class="py-3 px-3 text-start">${i18n.bi('النتيجة والمعدل الطبيعي', 'Values & Reference')}</th>
                <th class="py-3 px-3 text-start">${i18n.dict.common.status}</th>
                <th class="py-3 px-3 text-start">${i18n.bi('المعتمد / الوقت', 'Approved By / At')}</th>
                <th class="py-3 px-3 text-start">${i18n.dict.common.actions}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${results
                .map((r) => {
                  const pat = patMap.get(r.patientId);
                  const tst = tstMap.get(r.testId);
                  return `
                    <tr class="hover:bg-slate-50">
                      <td class="py-2.5 px-3 font-bold text-slate-900">${pat?.name || r.patientId}</td>
                      <td class="py-2.5 px-3 font-semibold text-slate-800">${tst ? i18n.bi(tst.nameAr, tst.nameEn) : r.testId}</td>
                      <td class="py-2.5 px-3 font-mono tabular-nums">
                        ${r.values.map((v) => `<div><strong>${v.parameterNameEn}:</strong> ${v.value} ${v.unit} [${v.normalRange}]</div>`).join('')}
                      </td>
                      <td class="py-2.5 px-3 font-semibold ${r.status === 'approved' ? 'text-emerald-700' : 'text-amber-700'}">
                        ${i18n.dict.statuses[r.status] || r.status}
                      </td>
                      <td class="py-2.5 px-3 font-mono text-slate-500 tabular-nums">
                        ${r.approvedBy ? `${r.approvedBy} (${r.approvedAt})` : '-'}
                      </td>
                      <td class="py-2.5 px-3">
                        <div class="flex items-center gap-2">
                          ${
                            canApprove && r.status !== 'approved'
                              ? `<button type="button" data-app="${r.id}" class="rev-app-btn text-emerald-700 hover:underline font-bold cursor-pointer">${i18n.dict.actions.approve}</button>`
                              : ''
                          }
                          ${
                            canPrint
                              ? `<button type="button" data-prt="${r.id}" class="rev-prt-btn text-sky-700 hover:underline font-semibold cursor-pointer">${i18n.dict.actions.print}</button>`
                              : ''
                          }
                        </div>
                      </td>
                    </tr>
                  `;
                })
                .join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    document.getElementById('rev-print-list')?.addEventListener('click', () => {
      const html = `
        <table class="print-table">
          <thead><tr><th>Patient</th><th>Test</th><th>Status</th><th>Approved By</th><th>Approved At</th></tr></thead>
          <tbody>
            ${results.map((r) => `<tr><td>${patMap.get(r.patientId)?.name || ''}</td><td>${tstMap.get(r.testId)?.nameAr || ''}</td><td>${r.status}</td><td>${r.approvedBy || '-'}</td><td class="tabular-nums">${r.approvedAt || '-'}</td></tr>`).join('')}
          </tbody>
        </table>
      `;
      printService.printA4(i18n.dict.nav.resultReview, html);
    });

    document.getElementById('rev-bulk-approve')?.addEventListener('click', async () => {
      if (!(await enforcePermission('approve', 'resultReview'))) return;
      const now = new Date().toISOString().replace('T', ' ').slice(0, 16);
      for (const r of results) {
        if (r.status !== 'approved') {
          r.status = 'approved';
          r.approvedBy = user?.username || 'doctor';
          r.approvedAt = now;
          await requestsRepository.saveResult(r);
        }
      }
      await authService.logAudit('اعتماد جماعي للنتائج', 'resultReview', 'BULK-APPROVE');
      showToast(i18n.bi('تم اعتماد جميع النتائج المعلقة بنجاح', 'All pending results approved'), 'success');
      results = await requestsRepository.getAllResults();
      renderView();
    });

    document.querySelectorAll<HTMLButtonElement>('.rev-app-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!(await enforcePermission('approve', 'resultReview'))) return;
        const target = results.find((x) => x.id === btn.getAttribute('data-app'));
        if (!target) return;
        target.status = 'approved';
        target.approvedBy = user?.username || 'doctor';
        target.approvedAt = new Date().toISOString().replace('T', ' ').slice(0, 16);
        await requestsRepository.saveResult(target);
        await authService.logAudit(`اعتماد نتيجة تحليل: ${target.id}`, 'resultReview', target.id);
        showToast(i18n.bi('تم اعتماد النتيجة بنجاح', 'Result approved'), 'success');
        results = await requestsRepository.getAllResults();
        renderView();
      });
    });

    document.querySelectorAll<HTMLButtonElement>('.rev-prt-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = results.find((x) => x.id === btn.getAttribute('data-prt'));
        if (!target) return;
        const pat = patMap.get(target.patientId);
        const tst = tstMap.get(target.testId);
        const html = `
          <div style="margin-bottom:12px; padding:8px; border:1px solid #cbd5e1; border-radius:6px;">
            <div><strong>${i18n.bi('اسم المريض:', 'Patient Name:')}</strong> ${pat?.name || ''} · <strong>${i18n.bi('العمر:', 'Age:')}</strong> ${pat?.age || ''}</div>
            <div><strong>${i18n.bi('التحليل:', 'Test:')}</strong> ${tst ? `${tst.nameAr} (${tst.nameEn})` : ''} · <strong>${i18n.bi('حالة التقرير:', 'Status:')}</strong> ${target.status.toUpperCase()}</div>
          </div>
          <table class="print-table">
            <thead>
              <tr>
                <th>Parameter</th>
                <th>Result</th>
                <th>Unit</th>
                <th>Reference Interval</th>
                <th>Flag</th>
              </tr>
            </thead>
            <tbody>
              ${target.values
                .map(
                  (v) => `
                  <tr>
                    <td>${v.parameterNameAr} / ${v.parameterNameEn}</td>
                    <td class="tabular-nums" style="font-weight:700;">${v.value}</td>
                    <td>${v.unit}</td>
                    <td class="tabular-nums">${v.normalRange}</td>
                    <td>${v.flag.toUpperCase()}</td>
                  </tr>
                `
                )
                .join('')}
            </tbody>
          </table>
          <div style="margin-top:16px; font-size:11px;">
            <strong>${i18n.bi('اعتماد الطبيب المسؤول:', 'Approved By Doctor:')}</strong> ${target.approvedBy || 'Pending'} (${target.approvedAt || ''})
          </div>
        `;
        printService.printA4(
          i18n.bi('تقرير نتيجة تحاليل طبية معتمد', 'Official Laboratory Result Report'),
          html,
          `${pat?.name || ''} — ${tst?.code || ''}`
        );
      });
    });
  };

  renderView();
}
