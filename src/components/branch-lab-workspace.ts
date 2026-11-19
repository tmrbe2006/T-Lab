import type { User } from '../types';
import { escapeHtml } from './common';
import { renderBranchBillingPilot } from './branch-billing-pilot';

type Patient = { id:string; name:string };
type Test = { id:string; code:string; name:string; price:string };
type Request = { id:string; requestNumber:string; patientId:string; status:string;version:number };

export async function renderBranchLabWorkspace(
  root:HTMLElement,user:User,branchId:string,patients:Patient[],
):Promise<void> {
  root.innerHTML='<section class="rounded border bg-white p-4 space-y-3">' +
    '<h2 class="font-bold">طلبات تحاليل الفرع والعينات — تجريبي</h2>' +
    '<p class="text-xs text-rose-900">النتائج النهائية والتقارير الطبية والفواتير غير مفعلة. لا تستخدم بيانات مرضى حقيقية.</p>' +
    '<form id="branch-lab-order-form" class="flex flex-wrap gap-2">' +
    '<select name="patientId" required class="border rounded p-2"></select>' +
    '<select name="testId" required class="border rounded p-2"></select>' +
    '<button type="submit" class="border rounded p-2">طلب تحليل مبدئي</button></form>' +
    '<div id="branch-lab-orders" class="space-y-2"></div>' +
    '<div id="branch-billing-pilot-panel"></div>' +
    '<p id="branch-lab-status" role="status" class="text-xs"></p></section>';
  const status=root.querySelector<HTMLElement>('#branch-lab-status');
  const form=root.querySelector<HTMLFormElement>('#branch-lab-order-form');
  const list=root.querySelector<HTMLElement>('#branch-lab-orders');
  const patientSelect=form?.querySelector<HTMLSelectElement>('[name=patientId]');
  const testSelect=form?.querySelector<HTMLSelectElement>('[name=testId]');
  const say=(message:string)=>{if(status)status.textContent=message;};
  const base='/api/v3/branches/'+encodeURIComponent(branchId);
  if(patientSelect) {
    patientSelect.replaceChildren(new Option('اختر المريض', ''));
    for(const patient of patients)patientSelect.add(new Option(patient.name,patient.id));
  }
  const fetchData=async<T>(path:string,options?:RequestInit):Promise<T>=>{
    const response=await fetch(base+path,{credentials:'same-origin',...options});
    if(!response.ok)throw Error('السيرفر رفض العملية ('+response.status+')');
    return response.json() as Promise<T>;
  };
  const loadOrders=async()=>{
    if(!list)return;
    try {
      const data=await fetchData<{items:Request[];nextCursor:string|null}>('/requests?limit=30');
      list.replaceChildren();
      const billingPanel=root.querySelector<HTMLElement>('#branch-billing-pilot-panel');
      if(billingPanel)await renderBranchBillingPilot(billingPanel,user,branchId,data.items.map(r=>r.id));
      for(const order of data.items){
        const row=document.createElement('div');
        row.className='border rounded p-3 flex flex-wrap gap-2 items-center';
        const description=document.createElement('span');
        description.textContent=order.requestNumber+' — '+order.status+
          ' — المريض '+order.patientId;
        row.append(description);
        if(order.status==='awaiting_sample' && ['Owner','Chemist','Technician'].includes(user.role)){
          const button=document.createElement('button');
          button.type='button';button.className='border rounded p-2';
          button.textContent='استلام عينة دم تجريبية';
          button.addEventListener('click',async()=>{
            button.disabled=true;
            try{
              await fetchData('/requests/'+encodeURIComponent(order.id)+'/receive',{
                method:'POST',headers:{'content-type':'application/json'},
                body:JSON.stringify({sampleType:'blood',version:order.version}),
              });
              await loadOrders();
              say('تم تسجيل استلام العينة في الفرع نفسه؛ لم يتم إصدار نتيجة.');
            }catch(error){
              button.disabled=false;
              say(error instanceof Error?error.message:'فشل الاستلام');
            }
          });
          row.append(button);
        }
        list.append(row);
      }
      if(data.nextCursor)say('تُعرض أول 30 طلبًا فقط؛ راجع بقية الصفحات قبل إجراء جرد شامل.');
    }catch(error){list.replaceChildren();say(error instanceof Error?error.message:'فشل تحميل الطلبات');}
  };
  try {
    const catalog=await fetchData<{items:Test[]}>('/catalogue');
    if(testSelect) {
      testSelect.replaceChildren(new Option('اختر التحليل', ''));
      for(const test of catalog.items){
        testSelect.add(new Option(test.name+' ['+test.code+']',test.id));
      }
    }
    await loadOrders();
  }catch{
    say('لا يمكن تحميل كتالوج التحاليل أو الطلبات لهذا الفرع');
  }
  form?.addEventListener('submit',async event=>{
    event.preventDefault();
    const data=new FormData(form);
    const patientId=String(data.get('patientId')||'');
    const testId=String(data.get('testId')||'');
    const button=form.querySelector<HTMLButtonElement>('[type=submit]');
    if(button)button.disabled=true;
    try{
      await fetchData('/requests',{
        method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({patientId,testIds:[testId]}),
      });
      say('أُنشئ طلب مبدئي معزول داخل الفرع، دون تحصيل أو اعتماد نتيجة.');
      await loadOrders();
    }catch(error){
      say(error instanceof Error?error.message:'لم يُنشأ طلب التحليل');
    }finally{if(button)button.disabled=false;}
  });
}
