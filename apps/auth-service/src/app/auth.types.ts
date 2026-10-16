export interface User {
  id: string;
  email: string;
  displayName: string;
  firstName: string | null;
  secondName: string | null;
  lastName: string | null;
  createdAt: string;
  provider?: string;
  photoUrl?: string;
  preferredLanguage?: string;
  role?: string;
}

export interface SessionMetadata {
  userId: string;
  expiresAt: number;        // Unix ms
  refreshExpiresAt: number; // Unix ms
}

export interface AuthResponse {
  user: User;
  metadata: SessionMetadata;
  // Mobile-only (omitted for web cookie clients)
  accessToken?: string;
  refreshToken?: string;
}

export interface ConsentRecord {
  userId: string;
  givenAt: string;
  policyVersion: string;
  ipAddress: string;
}

export type AuditEventType =
  | 'LOGIN'
  | 'LOGIN_FAILED'
  | 'LOGOUT'
  | 'REGISTER'
  | 'TOKEN_REFRESH'
  | 'ACCOUNT_DELETED'
  | 'DATA_EXPORT_REQUESTED'
  /**
   * Admin role granted or revoked via the Roles management page (feature 235).
   * `userId` (the existing audit column) holds the **actor**'s id; the
   * **target** user-id and direction live in `metadata`:
   *   { targetUserId, fromRole: 'user' | 'admin', toRole: 'user' | 'admin',
   *     actorUserId: string | 'rollout-migration', reason?: string }
   */
  | 'ROLE_CHANGE';

export interface AuditLogEntry {
  id: string;
  eventType: AuditEventType;
  userId: string | null;
  ipAddress: string;
  userAgent: string;
  occurredAt: string;
  outcome: 'success' | 'failure';
  metadata: Record<string, string>;
}
