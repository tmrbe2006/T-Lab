import { expect, test } from '@playwright/test';
import mysql from 'mysql2/promise';
import { StaffAccountStore } from '../../server/staff-accounts';
import { BranchRegistry } from '../../server/branch-registry';
import { BranchPatientStore } from '../../server/branch-patient-domain';
import { BranchLabWorkflowStore } from '../../server/branch-lab-workflow';
import { ServerPermissionStore } from '../../server/server-permissions';

test.skip(process.env.TLAB_BRANCH_E2E !== 'true', 'Only on disposable MySQL 5.5 CI sandbox.');

test('two branches are isolated in staff browser and only authorized staff receive specimens', async ({page}) => {
  const connect=()=>mysql.createConnection({
    host:process.env.MYSQL_HOST||'127.0.0.1',
    port:Number(process.env.MYSQL_PORT||3306),
    user:process.env.MYSQL_USER||'root',
    password:process.env.MYSQL_PASSWORD||'',
    database:process.env.MYSQL_DATABASE||'tlab_mysql55_ci',
  });
  const staff=new StaffAccountStore(connect),registry=new BranchRegistry(connect);
  const patients=new BranchPatientStore(connect),lab=new BranchLabWorkflowStore(connect);
  const grants=new ServerPermissionStore(connect);
  await staff.ensureTable();await registry.ensureTables();
  await patients.ensureTables();await lab.ensureTables();await grants.ensureTable();
  const suffix=Date.now().toString(36);
  const receptionistA=await staff.create('brweb_a_'+suffix,'Branch-Web-EmployeeA-2026!','Receptionist');
  const receptionistB=await staff.create('brweb_b_'+suffix,'Branch-Web-EmployeeB-2026!','Receptionist');
  const techA=await staff.create('brweb_t_'+suffix,'Branch-Web-TechA-2026!','Technician');
  const branchA=await registry.create('branch_web_a_'+suffix,'فرع أ اختبار');
  const branchB=await registry.create('branch_web_b_'+suffix,'فرع ب اختبار');
  await registry.grant(receptionistA.id,branchA.id);
  await registry.grant(receptionistB.id,branchB.id);
  await registry.grant(techA.id,branchA.id);
  const testId='000_branch_webtest_'+suffix;
  const db=await connect();
  try {
    await db.execute('INSERT INTO lab_tests (id,code,name_ar,price,active) VALUES (?,?,?,?,1)',
      [testId,'BRWEB','Branch Web Synthetic Lab Test',25]);
    await db.execute(
      'INSERT INTO test_parameters (id,test_id,code,name_ar,result_type,active,is_calculated) ' +
      'VALUES (?,?,?,?,?,1,0)',
      ['brweb_param_'+suffix,testId,'WEBPAR','Web synthetic parameter','numeric'],
    );
  } finally { await db.end(); }

  const login=async(username:string,password:string)=>{
    await page.goto('/');
    await expect(page.locator('#login-form')).toBeVisible({timeout:30_000});
    await page.locator('#login-username').fill(username);
    await page.locator('#login-password').fill(password);
    await page.locator('#login-form button[type="submit"]').click();
    await expect(page.locator('#branch-patients-select')).toBeVisible({timeout:30_000});
  };
  await login(receptionistA.username,'Branch-Web-EmployeeA-2026!');
  const selector=page.locator('#branch-patients-select');
  await expect(selector.locator('option')).toHaveCount(2);
  await selector.selectOption(branchA.id);
  await page.locator('#branch-patient-create [name="name"]').fill('Synthetic patient A');
  await page.locator('#branch-patient-create button[type="submit"]').click();
  await expect(page.locator('#branch-patients-list')).toContainText('Synthetic patient A',{timeout:20_000});
  await page.locator('#branch-lab-order-form [name="testId"]').selectOption(testId);
  await page.locator('#branch-lab-order-form [name="patientId"]').selectOption({index:1});
  await page.locator('#branch-lab-order-form button[type="submit"]').click();
  await expect(page.locator('#branch-lab-orders')).toContainText('awaiting_sample',{timeout:20_000});

  await page.locator('#branch-patients-logout').click();
  await login(receptionistB.username,'Branch-Web-EmployeeB-2026!');
  await expect(page.locator('#branch-patients-select option')).toHaveCount(2);
  await page.locator('#branch-patients-select').selectOption(branchB.id);
  await expect(page.locator('#branch-patients-list')).not.toContainText('Synthetic patient A');
  await expect(page.locator('#branch-lab-orders')).not.toContainText('awaiting_sample');
  await page.locator('#branch-patients-logout').click();

  await login(techA.username,'Branch-Web-TechA-2026!');
  await page.locator('#branch-patients-select').selectOption(branchA.id);
  await expect(page.locator('#branch-lab-orders')).toContainText('awaiting_sample',{timeout:20_000});
  await page.locator('#branch-lab-orders button').first().click();
  await expect(page.locator('#branch-lab-orders')).toContainText('sample_received',{timeout:20_000});
});
