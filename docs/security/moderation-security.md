# Content Moderation & Reporting Security Architecture (Day 18)

---

## 1. Access Control & Privilege Separation

- **Multi-Layer Defense**: Every admin moderation endpoint enforces `authenticate` → `requireActiveAccount` → `requireAccountType('ADMIN')` → database-backed `AdminProfileModel` permission verification (`requirePermission` / `requireAnyPermission`). Client-supplied roles or permissions are ignored and rejected by strict Zod schemas.
- **Least Privilege**: Assigning `VIEW_MODERATION_QUEUE` permits read inspection only; content mutations require task-specific permissions (`MODERATE_DESTINATIONS`, `MODERATE_POSTS`, `MODERATE_COMMENTS`, `REVIEW_REPORTS`). Moderators with `MODERATE_POSTS` receive `403 INSUFFICIENT_PERMISSIONS` when attempting comment removal, destination approval, or report resolution.
- **No Permanent Deletion**: Ordinary moderation routes never call `deleteOne` / `deleteMany` on posts or comments. Post and comment removals soft-delete (`status: 'REMOVED'`, `deletedAt`) while preserving original records for audit and lawful restoration workflows.

---

## 2. Transaction & Concurrency Integrity

- All moderation state mutations (`destination approve/reject`, `post approve/reject/remove`, `comment remove/restore`, `report review`) execute conditional `findOneAndUpdate` pre-state filters inside `ModerationRepository.withTransaction`:
  - Duplicate or racing moderator approvals/reviews fail with `409 INVALID_STATUS_TRANSITION` instead of creating duplicate destinations or double-decrementing `commentsCount`.
  - Comment removal guards `{ commentsCount: { $gt: 0 } }` on `PostModel`, preventing negative engagement counters.
  - Comment restoration verifies that the parent `Post` still exists and is not `REMOVED`/`deletedAt !== null`.
  - **Production Fail-Closed Guarantee**: When `NODE_ENV === 'production'`, `withTransaction` rejects topologies without replica-set transactions (`500 TRANSACTION_REQUIRED`) rather than falling back to non-atomic writes.

---

## 3. Reporting Abuse & PII Protection

- **Server-Derived Identity**: `reporterId` is derived strictly from `req.user.id`; Zod `.strict()` rejects injected `reporterId` or `status`.
- **Self-Report Prevention**: Blocking self-reports applies to caller's own `ACCOUNT` as well as any `POST` or `COMMENT` authored by caller (`403 SELF_REPORT_FORBIDDEN`).
- **Database-Enforced Duplicate Active Prevention**: Partial unique index `idx_reports_active_unique` prevents race conditions from creating duplicate `PENDING` / `UNDER_REVIEW` reports on the same `(reporterId, targetType, targetId)`.
- **Data Minimization & Immutable Audit Trail**: Moderation DTOs exclude `email`, `passwordHash`, token hashes, and `storageKey`s. Every moderation decision atomically writes an append-only `AuditLog` entry protected by Mongoose update/delete pre-hooks and recursive key redaction.
