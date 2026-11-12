import { ClientSession, Types } from 'mongoose';
import type {
  AccountType,
  AdminAuditAction,
  AdminLevel,
  AuditLogEntryDto,
  AuditTargetEntityType,
} from '@kerala-tourism/shared-types';
import { AuditLogModel, IAuditLogDocument } from './audit-log.model';

const FORBIDDEN_AUDIT_KEYS = new Set([
  'password',
  'passwordhash',
  'token',
  'accesstoken',
  'refreshtoken',
  'refreshtokenhash',
  'replacedbytokenhash',
  'storagekey',
  'authorization',
  'cookie',
  'secret',
]);

const stripControlCharacters = (value: string): string => {
  let out = '';
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code >= 32 && code !== 127) {
      out += value[i];
    }
  }
  return out;
};

export const sanitizeAuditText = (value: string | null | undefined, maxLength: number): string | null => {
  if (!value || typeof value !== 'string') {
    return null;
  }

  const cleaned = stripControlCharacters(value).trim();
  if (!cleaned) {
    return null;
  }

  return cleaned.slice(0, maxLength);
};

const sanitizeAuditValue = (value: unknown, depth = 0): unknown => {
  if (depth > 4 || value === null || value === undefined) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeAuditValue(item, depth + 1));
  }
  if (typeof value === 'object' && !(value instanceof Date) && !(value instanceof Types.ObjectId)) {
    return sanitizeAuditStateSnapshot(value as Record<string, unknown>, depth + 1);
  }
  return value;
};

export const sanitizeAuditStateSnapshot = (
  state: Record<string, unknown>,
  depth = 0,
): Record<string, unknown> => {
  const safe: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(state)) {
    if (FORBIDDEN_AUDIT_KEYS.has(key.toLowerCase())) {
      continue;
    }
    if (val !== undefined) {
      safe[key] = sanitizeAuditValue(val, depth);
    }
  }
  return safe;
};

export interface RecordAdminAuditInput {
  actorAccountId: Types.ObjectId | string;
  actorAccountType: AccountType;
  actorAdminLevel: AdminLevel;
  action: AdminAuditAction;
  targetEntityId: Types.ObjectId | string;
  targetEntityType?: AuditTargetEntityType;
  reason: string;
  beforeState: Record<string, unknown>;
  afterState: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export class AuditLogService {
  /**
   * Appends an immutable audit record for sensitive administrative actions.
   * Accepts an optional ClientSession so status changes, session revocations,
   * and audit records commit or roll back atomically inside MongoDB transactions.
   */
  public async recordAdminAction(
    input: RecordAdminAuditInput,
    session?: ClientSession,
  ): Promise<AuditLogEntryDto> {
    const safeReason = sanitizeAuditText(input.reason, 500) || 'Administrative action executed';

    const doc = new AuditLogModel({
      actorAccountId: new Types.ObjectId(input.actorAccountId),
      actorAccountType: input.actorAccountType,
      actorAdminLevel: input.actorAdminLevel,
      action: input.action,
      targetEntityId: new Types.ObjectId(input.targetEntityId),
      targetEntityType: input.targetEntityType ?? 'ACCOUNT',
      reason: safeReason,
      beforeState: sanitizeAuditStateSnapshot(input.beforeState),
      afterState: sanitizeAuditStateSnapshot(input.afterState),
      ipAddress: sanitizeAuditText(input.ipAddress, 64),
      userAgent: sanitizeAuditText(input.userAgent, 256),
      timestamp: new Date(),
    });

    const saved = await doc.save({ session });
    return this.toDto(saved);
  }

  public toDto(doc: IAuditLogDocument): AuditLogEntryDto {
    return {
      id: doc._id.toString(),
      actorAccountId: doc.actorAccountId.toString(),
      actorAccountType: doc.actorAccountType,
      actorAdminLevel: doc.actorAdminLevel,
      action: doc.action,
      targetEntityId: doc.targetEntityId.toString(),
      targetEntityType: doc.targetEntityType,
      reason: doc.reason,
      beforeState: doc.beforeState || {},
      afterState: doc.afterState || {},
      ipAddress: doc.ipAddress ?? null,
      userAgent: doc.userAgent ?? null,
      timestamp: doc.timestamp.toISOString(),
    };
  }
}

export const auditLogService = new AuditLogService();
