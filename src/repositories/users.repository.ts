import { db } from '../db/database';
import type { Employee, User } from '../types';

export class UsersRepository {
  async getAllUsers(): Promise<User[]> {
    return db.users.toArray();
  }

  async getByUsername(username: string): Promise<User | undefined> {
    return db.users.where('username').equals(username).first();
  }

  async saveUser(user: User): Promise<string> {
    return db.users.put(user);
  }

  async deleteUser(id: string): Promise<void> {
    await db.users.delete(id);
  }

  async getAllEmployees(): Promise<Employee[]> {
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
