import { authService } from '../../auth/auth.service';
import { ALL_ACTIONS, ALL_RESOURCES } from '../../db/seed';
import { i18n } from '../../i18n';
import type { PermissionAction, ResourceScreen, RoleName } from '../../types';

type Row={resource:string;actions:Record<string,boolean>};
const roles:RoleName[]=['Doctor','Chemist','Technician','Receptionist','Accountant'];
async function api<T>(role:string,method:'GET'|'PUT',rows?:Row[]):Promise<T>{
  const response=await fetch('/api/branch-pilot/role-templates/'+encodeURIComponent(role),{
    method,cache:'no-store',credentials:'same-origin',
    ...(rows?{headers:{'Content-Type':'application/json'},body:JSON.stringify({rows})}:{}),
  });
  let data:T & {ok?:boolean;error?:string;source?:string};
  try{data=await response.json() as typeof data;}catch{throw new Error('INVALID_MYSQL_RESPONSE');}
  if(!response.ok||data.ok!==true||data.source!=='mysql')
    throw new Error(data.error||'MYSQL_ROLE_PERMISSIONS_FAILED');
  return data;
}
export async function renderRoleTemplatesPanel(host:HTMLElement):Promise<void>{
  const user=authService.getCurrentUser();
  if(user?.role!=='Developer'){
    host.textContent=i18n.bi('إدارة الأدوار للمبرمج فقط','Role templates require Developer access');
    return;
  }
  host.replaceChildren();
  const section=document.createElement('section');
  section.className='border bg-white rounded-xl p-4 space-y-3 mb-6';
  const heading=document.createElement('h2');
  heading.textContent=i18n.bi('مصفوفة صلاحيات الأدوار الأساسية (MySQL)','MySQL Role Permission Templates');
  heading.className='font-bold text-lg';
  const explanation=document.createElement('p');
  explanation.className='text-xs text-slate-600';
  explanation.textContent=i18n.bi('صلاحيات الدور هي الأساس، ويمكن تخصيص صلاحيات مستخدم لكل فرع في اللوحة التالية. التعديل هنا لا يغيّر صلاحيات الفروع المخصصة مسبقًا.','Role defaults apply unless overridden by user/branch permissions.');
  const select=document.createElement('select');
  select.className='border rounded p-2';
  for(const role of roles)select.add(new Option(i18n.dict.roles[role]+' ('+role+')',role));
  const tableHost=document.createElement('div');
  tableHost.className='overflow-auto max-h-[65vh]';
  const status=document.createElement('p');status.setAttribute('role','status');
  const save=document.createElement('button');
  save.type='button';save.textContent=i18n.bi('حفظ صلاحيات الدور في MySQL','Save MySQL Role Template');
  save.className='bg-sky-700 text-white rounded px-4 py-2';
  section.append(heading,explanation,select,status,tableHost,save);host.append(section);
  let original:Row[]=[];
  const load=async()=>{
    save.disabled=true;
    tableHost.replaceChildren();
    try{
      const response=await api<{rows:Row[]}>(select.value,'GET');
      original=response.rows;
      const table=document.createElement('table');
      table.className='text-xs min-w-[1100px] w-full';
      const head=document.createElement('thead');
      const hr=document.createElement('tr');
      const title=document.createElement('th');title.textContent=i18n.bi('الشاشة','Screen');
      title.className='text-start p-2';hr.append(title);
      for(const action of ALL_ACTIONS){
        const th=document.createElement('th');th.textContent=i18n.dict.actions[action]||action;
        th.className='p-2';hr.append(th);
      }
      head.append(hr);table.append(head);
      const body=document.createElement('tbody');
      for(const resource of ALL_RESOURCES){
        const tr=document.createElement('tr');
        tr.className='border-b';
        const label=document.createElement('td');
        label.textContent=(i18n.dict.nav as Record<string,string>)[resource]||resource;
        label.className='p-2 font-bold';tr.append(label);
        const row=original.find(x=>x.resource===resource);
        for(const action of ALL_ACTIONS){
          const td=document.createElement('td');td.className='p-1 text-center';
          const checkbox=document.createElement('input');checkbox.type='checkbox';
          checkbox.className='role-action';
          checkbox.dataset.resource=resource;checkbox.dataset.action=action;
          checkbox.checked=row?.actions[action]===true;
          // Never allow administrator/system rights through ordinary roles.
          checkbox.disabled=['permissions','settings','branches'].includes(resource);
          td.append(checkbox);tr.append(td);
        }
        body.append(tr);
      }
      table.append(body);tableHost.append(table);
      save.disabled=false;
      status.textContent=i18n.bi('تم تحميل الصلاحيات من MySQL','Loaded from MySQL');
    }catch(error){
      status.textContent=String(error instanceof Error?error.message:error);
    }
  };
  select.addEventListener('change',()=>{void load();});
  save.addEventListener('click',async()=>{
    save.disabled=true;
    try{
      const rows=ALL_RESOURCES.map((resource:ResourceScreen)=>{
        const old=original.find(r=>r.resource===resource);
        const actions={} as Record<PermissionAction,boolean>;
        for(const action of ALL_ACTIONS)actions[action]=old?.actions[action]===true;
        return {resource,actions};
      });
      tableHost.querySelectorAll<HTMLInputElement>('.role-action:not(:disabled)').forEach(box=>{
        const row=rows.find(r=>r.resource===box.dataset.resource);
        if(row&&box.dataset.action)row.actions[box.dataset.action as PermissionAction]=box.checked;
      });
      await api(select.value,'PUT',rows);
      status.textContent=i18n.bi('تم حفظ مصفوفة الدور في MySQL','Role template saved in MySQL');
      await load();
    }catch(error){status.textContent=String(error instanceof Error?error.message:error);}
    finally{save.disabled=false;}
  });
  await load();
}
