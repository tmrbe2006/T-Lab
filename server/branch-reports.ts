import type { Express, Request, Response } from 'express';
import type { Connection, RowDataPacket } from 'mysql2/promise';
import type { IdentityResolver } from './patient-domain';
import { BranchRegistry } from './branch-registry';

type SummaryRow = RowDataPacket & {
  branch_id: string; total_patients: number | string; total_requests: number | string;
  received_samples: number | string;
};

export class BranchSummaryStore {
  constructor(private readonly connect: () => Promise<Connection>) {}
  async summary(branchId: string) {
    const db = await this.connect();
    try {
      const [patients] = await db.execute<RowDataPacket[]>(
        'SELECT COUNT(*) AS n FROM secure_branch_patients WHERE branch_id=? AND active=1',[branchId],
      );
      const [requests] = await db.execute<RowDataPacket[]>(
        'SELECT COUNT(*) AS n FROM secure_branch_requests WHERE branch_id=?',[branchId],
      );
      const [samples] = await db.execute<RowDataPacket[]>(
        'SELECT COUNT(*) AS n FROM secure_branch_samples WHERE branch_id=?',[branchId],
      );
      const [billing]=await db.execute<RowDataPacket[]>(
        'SELECT COALESCE(SUM(amount_minor),0) AS billed, COALESCE(SUM(paid_minor),0) AS collected '+
        'FROM secure_branch_invoice_drafts WHERE branch_id=?',[branchId]);
      return {
        branchId, patients:Number(patients[0].n), requests:Number(requests[0].n),
        receivedSamples:Number(samples[0].n), demoBilledMinor:Number(billing[0].billed),
        demoCollectedMinor:Number(billing[0].collected),
        financialTotalsAvailable:false, clinicalReportsAvailable:false,
      };
    } finally {await db.end();}
  }
  async consolidated() {
    const db = await this.connect();
    try {
      const [rows] = await db.execute<SummaryRow[]>(
        'SELECT b.id AS branch_id,'+
        '(SELECT COUNT(*) FROM secure_branch_patients p WHERE p.branch_id=b.id AND p.active=1) AS total_patients,'+
        '(SELECT COUNT(*) FROM secure_branch_requests r WHERE r.branch_id=b.id) AS total_requests,'+
        '(SELECT COUNT(*) FROM secure_branch_samples s WHERE s.branch_id=b.id) AS received_samples '+
        ',(SELECT COALESCE(SUM(amount_minor),0) FROM secure_branch_invoice_drafts i WHERE i.branch_id=b.id) AS demo_billed,'+
        '(SELECT COALESCE(SUM(paid_minor),0) FROM secure_branch_invoice_drafts i WHERE i.branch_id=b.id) AS demo_collected ' +
        'FROM secure_lab_branches b WHERE b.active=1 ORDER BY b.code LIMIT 100',
      );
      return rows.map(row=>({
        branchId:String(row.branch_id),patients:Number(row.total_patients),
        requests:Number(row.total_requests),receivedSamples:Number(row.received_samples),
        demoBilledMinor:Number(row.demo_billed),demoCollectedMinor:Number(row.demo_collected),
      }));
    }finally{await db.end();}
  }
}
export function installBranchReportRoutes(app:Express,reports:BranchSummaryStore,
  branches:BranchRegistry,identity:IdentityResolver):void {
  app.get('/api/v3/branches/:branchId/summary',async(req:Request,res:Response)=>{
    const actor=await identity(req);
    if(!actor)return res.status(401).json({ok:false});
    if(process.env.TLAB_MULTIBRANCH_MODE!=='true')return res.status(503).json({ok:false});
    try{
      if(!(await branches.isAllowed(actor,req.params.branchId)))
        return res.status(404).json({ok:false});
      return res.json({ok:true,report:await reports.summary(req.params.branchId)});
    }catch{return res.status(503).json({ok:false});}
  });
  app.get('/api/v3/admin/consolidated-summary',async(req:Request,res:Response)=>{
    const actor=await identity(req);
    if(!actor)return res.status(401).json({ok:false});
    if(actor.role!=='Developer'&&actor.role!=='Owner')
      return res.status(403).json({ok:false});
    if(process.env.TLAB_MULTIBRANCH_MODE!=='true')return res.status(503).json({ok:false});
    try{
      return res.json({
        ok:true,branches:await reports.consolidated(),
        limitedToBranchScopedPilot:true,financialConsolidationAvailable:false,
      });
    }catch{return res.status(503).json({ok:false});}
  });
}
