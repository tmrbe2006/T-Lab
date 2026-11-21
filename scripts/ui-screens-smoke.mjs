/**
 * CI-only read-only UI route smoke for the disposable MySQL fixture.
 * No patient, invoice, QC or inventory data is written from the browser.
 * Must be run after the local server is started and browser dependencies loaded.
 */
import { chromium } from 'playwright';
const base=process.env.TLAB_TEST_URL||'http://127.0.0.1:3127';
const username=process.env.TLAB_TEST_USERNAME||'developer';
const password=process.env.TLAB_TEST_PASSWORD;
if(!password)throw new Error('TLAB_TEST_PASSWORD_REQUIRED');
const routes=[
  'dashboard','patients','doctors','doctorSpecialties','employees','users',
  'permissions','branches','tests','scientificDepartments','sampleTubes',
  'testParameters','requests','samples','results','microbiology',
  'qualityControl','homeVisits','corporateContracts','resultReview','reports',
  'invoices','payments','accounts','journalEntries','cashbox','expenses',
  'commissions','inventory','purchases','erpAccounting','labToLab',
];
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1440,height:900}});
const issues=[];
let route='login';
page.on('pageerror',err=>{
  issues.push({route,kind:'pageerror',message:err.message.slice(0,320),stack:String(err.stack||'').slice(0,1300)});
});
page.on('response',response=>{
  const u=response.url();
  if(u.includes('/api/branch-pilot/')&&response.status()>=400 &&
     !(route==='login' && response.status()===401 && u.includes('/staff-session'))){
    response.text().then(body=>{
      issues.push({route,kind:'http',status:response.status(),
        url:u.slice(0,250),response:body.slice(0,600)});
    }).catch(()=>{});
  }
});
try{
  await page.goto(base+'/#/login',{waitUntil:'domcontentloaded'});
  await page.waitForTimeout(1200);
  if(!(await page.locator('#login-username').count())){
    console.error('LOGIN_PAGE_NOT_RENDERED',JSON.stringify({
      url:page.url(),
      title:await page.title(),
      body:(await page.locator('body').innerText()).slice(0,1300),
      html:(await page.content()).slice(0,900),
      issues,
    }));
    process.exitCode=1;
    throw new Error('LOGIN_PAGE_NOT_RENDERED');
  }
  await page.locator('#login-username').fill(username);
  await page.locator('#login-password').fill(password);
  await page.locator('#login-load-branches').click();
  await page.locator('#login-branch:not([disabled])').waitFor({timeout:15000});
  await page.locator('#login-branch').selectOption('branch_main');
  await page.locator('#login-form button[type="submit"]').click();
  await page.waitForURL('**/#/dashboard',{timeout:15000});
  for(const id of routes){
    route=id;
    await page.goto(base+'/#/'+id,{waitUntil:'domcontentloaded'});
    await page.waitForTimeout(350);
    const body=await page.locator('#app').innerText();
    if(!body||body.trim().length<20)
      issues.push({route:id,kind:'empty-route',message:'No meaningful page contents'});
  }
}finally{
  await browser.close();
}
console.log(JSON.stringify({routesChecked:routes.length,issues},null,2));
if(issues.length)process.exitCode=1;
