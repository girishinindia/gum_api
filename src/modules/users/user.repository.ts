import { v4 as uuid } from 'uuid';

import { DEFAULT_USER_ROLE } from '../../config/constants';
import { UserRecord } from './user.types';

class InMemoryUserRepository {
  private readonly byId = new Map<string, UserRecord>();
  private readonly byEmail = new Map<string, UserRecord>();

  async create(input: { name: string; email: string; passwordHash: string }) {
    const now = new Date().toISOString();
    const record: UserRecord = {
      id: uuid(),
      name: input.name,
      email: input.email.toLowerCase(),
      passwordHash: input.passwordHash,
      role: DEFAULT_USER_ROLE,
      createdAt: now,
      updatedAt: now
    };

    this.byId.set(record.id, record);
    this.byEmail.set(record.email, record);
    return record;
  }

  async findByEmail(email: string) {
    return this.byEmail.get(email.toLowerCase()) ?? null;
  }

  async findById(id: string) {
    return this.byId.get(id) ?? null;
  }

  async update(id: string, patch: Partial<Pick<UserRecord, 'name'>>) {
    const existing = this.byId.get(id);
    if (!existing) return null;

    const updated: UserRecord = {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString()
    };

    this.byId.set(id, updated);
    this.byEmail.set(updated.email, updated);
    return updated;
  }
}

export const userRepository = new InMemoryUserRepository();
