import { db } from '../db/database';
import { useMySQLCrud } from './mysql-crud.adapter';
import type { Employee, User } from '../types';

export class UsersRepository {
  private async getServerList<T>(path:string,key:string):Promise<T[]>{
    const response=await fetch('/api/branch-pilot/'+path,{credentials:'same-origin',cache:'no-store'});
    const result=await response.json() as Record<string,unknown>;
    if(!response.ok || result.ok!==true || result.source!=='mysql' || !Array.isArray(result[key]))
      throw new Error(String(result.error||'MYSQL_USERS_UNAVAILABLE'));
    return result[key] as T[];
  }
  private async saveServer(path:string,record:User):Promise<void>{
    const response=await fetch('/api/branch-pilot/'+path+'/'+encodeURIComponent(record.id),{
      method:'PUT',credentials:'same-origin',cache:'no-store',
      headers:{'Content-Type':'application/json'},body:JSON.stringify({record}),
    });
    const data=await response.json() as Record<string,unknown>;
    if(!response.ok||data.ok!==true||data.source!=='mysql')
      throw new Error(String(data.error||'MYSQL_SAVE_USER_FAILED'));
  }
  private async deleteServer(path:string,id:string):Promise<void>{
    const response=await fetch('/api/branch-pilot/'+path+'/'+encodeURIComponent(id),{
      method:'DELETE',credentials:'same-origin',cache:'no-store',
    });
    const data=await response.json() as Record<string,unknown>;
    if(!response.ok||data.ok!==true||data.source!=='mysql')
      throw new Error(String(data.error||'MYSQL_ARCHIVE_USER_FAILED'));
  }
  async getAllUsers(): Promise<User[]> {
    if(useMySQLCrud())return this.getServerList<User>('user-records','users');
    return db.users.toArray();
  }

  async getByUsername(username: string): Promise<User | undefined> {
    if(useMySQLCrud())return (await this.getAllUsers()).find(x=>x.username===username);
    return db.users.where('username').equals(username).first();
  }

  async saveUser(user: User): Promise<string> {
    if(useMySQLCrud()){
      await this.saveServer('user-records',user);
      return user.id;
    }
    return db.users.put(user);
  }

  async deleteUser(id: string): Promise<void> {
    if(useMySQLCrud()){
      await this.deleteServer('user-records',id);
      return;
    }
    await db.users.delete(id);
  }

  async getAllEmployees(): Promise<Employee[]> {
    if(useMySQLCrud())return this.getServerList<Employee>('employee-records','employees');
    return db.employees.toArray();
  }

  async saveEmployee(employee: Employee): Promise<string> {
    return db.employees.put(employee);
  }

  async deleteEmployee(id: string): Promise<void> {
    await db.employees.delete(id);
  }
}

export const usersRepository = new UsersRepository();
