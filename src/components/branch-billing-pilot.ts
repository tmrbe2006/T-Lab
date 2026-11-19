import type { User } from '../types';
type Draft = {id:string;requestId:string;totalMinor:number;paidMinor:number;remainingMinor:number};
export async function renderBranchBillingPilot(root:HTMLElement,user:User,branchId:string,requestIds:string[]){
  if(!['Receptionist','Accountant','Owner'].includes(user.role))return;
  root.innerHTML='<section class="bg-white border rounded p-4 space-y-2">' +
    '<h2 class="font-bold">مسودات الفواتير والمدفوعات الوهمية — تجربة فقط</h2>'+
    '<p class="text-xs text-rose-900">لا تُصدر فواتير أو إيصالات رسمية، ولا تتغير أرصدة الحسابات أو الخزنة.</p>'+
    '<form id="branch-billing-create" class="flex gap-2 flex-wrap">' +
    '<select name="requestId" required class="border p-2"><option value="">اختر طلب التحليل</option></select>'+
    '<button type="submit" class="border p-2">إنشاء مسودة فاتورة</button></form>'+
    '<div id="branch-billing-list" class="text-xs"></div>'+
    '<form id="branch-billing-pay" class="flex gap-2 flex-wrap">' +
    '<select name="invoiceId" required class="border p-2"><option value="">اختر مسودة</option></select>'+
    '<input name="amount" required placeholder="قيمة دفع وهمي 0.00" class="border p-2" />'+
    '<button type="submit" class="border p-2">تسجيل مبلغ تجريبي</button></form>'+
    '<p id="branch-billing-status" role="status" class="text-xs"></p></section>';
  const say=(msg:string)=>{const el=root.querySelector('#branch-billing-status');if(el)el.textContent=msg;};
  const base='/api/v3/branches/'+encodeURIComponent(branchId)+'/billing';
  const api=async<T>(suffix:string,options?:RequestInit)=>{
    const response=await fetch(base+suffix,{credentials:'same-origin',...options});
    if(!response.ok)throw Error('رفض السيرفر العملية المالية ('+response.status+')');
    return response.json() as Promise<T>;
  };
  const orders=root.querySelector<HTMLSelectElement>('#branch-billing-create [name=requestId]');
  for(const id of requestIds)orders?.add(new Option(id,id));
  const refresh=async()=>{
    const d=await api<{drafts:Draft[]}>('/drafts');
    const table=root.querySelector<HTMLElement>('#branch-billing-list');
    if(table){
      table.replaceChildren();
      for(const draft of d.drafts){
        const p=document.createElement('p');
        p.textContent=draft.id+' — الإجمالي: '+(draft.totalMinor/100).toFixed(2)+
          ' — مدفوع وهمي: '+(draft.paidMinor/100).toFixed(2)+
          ' — متبقي: '+(draft.remainingMinor/100).toFixed(2);
        table.append(p);
      }
    }
    const select=root.querySelector<HTMLSelectElement>('#branch-billing-pay [name=invoiceId]');
    if(select){
      select.replaceChildren(new Option('اختر مسودة', ''));
      for(const draft of d.drafts)select.add(new Option(draft.id,draft.id));
    }
  };
  const create=root.querySelector<HTMLFormElement>('#branch-billing-create');
  create?.addEventListener('submit',async(event)=>{
    event.preventDefault();
    const data=new FormData(create);
    try{
      await api('/drafts',{method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({requestId:data.get('requestId')})});
      say('تم حفظ المسودة التجريبية دون إصدار فاتورة رسمية.');
      await refresh();
    }catch(e){say(e instanceof Error?e.message:'فشل');}
  });
  const pay=root.querySelector<HTMLFormElement>('#branch-billing-pay');
  if(!['Accountant','Owner'].includes(user.role))pay?.remove();
  else pay?.addEventListener('submit',async(event)=>{
    event.preventDefault();
    const data=new FormData(pay);
    try{
      await api('/mock-payments',{method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({invoiceId:data.get('invoiceId'),amount:data.get('amount'),
          idempotencyKey:'brmock_'+crypto.randomUUID()})});
      say('نجح الدفع الوهمي؛ لم يصدر إيصال رسمي أو قيد محاسبي.');
      await refresh();
    }catch(e){say(e instanceof Error?e.message:'فشل');}
  });
  try{await refresh();}catch(e){say('تعذر عرض مسودات الفواتير في هذا الفرع');}
}
