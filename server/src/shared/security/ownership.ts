import { Types } from 'mongoose';
import { ForbiddenError, NotFoundError } from '../errors/AppError';
import { IAdminProfileDocument } from '../models';
import { AdminPermission } from '@kerala-tourism/shared-types';

export interface OwnershipOptions {
  resourceName?: string;
  concealWithNotFound?: boolean;
}

/**
 * Asserts that the authenticated principal is the direct owner of the targeted resource.
 * If concealWithNotFound is true, returns 404 instead of 403 to prevent IDOR probing/enumeration.
 */
export const assertOwnership = (
  resourceOwnerId: string | Types.ObjectId,
  principalId: string | Types.ObjectId,
  options: OwnershipOptions = {},
): void => {
  if (!resourceOwnerId || !principalId) {
    if (options.concealWithNotFound) {
      throw new NotFoundError(`${options.resourceName || 'Resource'} not found`, 'RESOURCE_NOT_FOUND');
    }
    throw new ForbiddenError(
      'You do not have permission to access or modify this resource',
      'FORBIDDEN_RESOURCE_ACCESS',
    );
  }

  const ownerStr = resourceOwnerId.toString();
  const principalStr = principalId.toString();

  if (ownerStr !== principalStr) {
    if (options.concealWithNotFound) {
      throw new NotFoundError(`${options.resourceName || 'Resource'} not found`, 'RESOURCE_NOT_FOUND');
    }
    throw new ForbiddenError(
      'You do not have permission to access or modify this resource',
      'FORBIDDEN_RESOURCE_ACCESS',
    );
  }
};

/**
 * Asserts ownership with administrative override when the admin possesses the designated permission.
 */
export const assertOwnershipOrAdmin = (
  resourceOwnerId: string | Types.ObjectId,
  principalId: string | Types.ObjectId,
  adminProfile?: IAdminProfileDocument | null,
  requiredPermission?: AdminPermission,
  options: OwnershipOptions = {},
): void => {
  if (adminProfile && requiredPermission && adminProfile.permissions.includes(requiredPermission)) {
    return; // Admin override granted
  }

  assertOwnership(resourceOwnerId, principalId, options);
};
