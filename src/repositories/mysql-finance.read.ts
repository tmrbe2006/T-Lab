/** Read-only, branch-scoped MySQL finance data in the Windows 3127 pilot.
 * Never fall back to IndexedDB, demo fixtures, or localStorage.
 * The financial write service is intentionally disabled until it can atomically
 * post invoice, receipt, commission and double-entry ledger transactions.
 */
export function inMySQLFinancePilot():boolean {
  return typeof window!=='undefined' && window.location.port==='3127';
}
export type FinanceReadResource=
  'invoices'|'invoiceItems'|'payments'|'journalEntries'|'accounts'|
  'cashbox'|'dailyClosings'|'expenses'|'commissions'|'costCenters'|'periodLocks';
export async function financeMySQLRows<T>(resource:FinanceReadResource):Promise<T[]>{
  const response=await fetch('/api/branch-pilot/finance/'+resource,{
    method:'GET',credentials:'same-origin',cache:'no-store',
  });
  let body:{ok?:boolean;source?:string;resource?:string;records?:T[];error?:string};
  try{body=await response.json() as typeof body;}
  catch{throw new Error('MYSQL_FINANCE_RESPONSE_INVALID');}
  if(!response.ok || body.ok!==true)throw new Error(body.error||'MYSQL_FINANCE_UNAVAILABLE');
  if(body.source!=='mysql'||body.resource!==resource||!Array.isArray(body.records))
    throw new Error('MYSQL_FINANCE_SOURCE_INVALID');
  return body.records;
}
export function requireMySQLFinancialWrite():void{
  if(inMySQLFinancePilot()){
    throw new Error('MYSQL_FINANCE_WRITE_NOT_MIGRATED: Financial changes are blocked until atomic MySQL ledger posting is implemented.');
  }
}
