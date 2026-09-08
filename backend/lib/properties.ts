export type PropertyStatus = 'draft' | 'published' | 'rented' | 'archived';
export type PropertyType = 'apartment' | 'house' | 'townhouse' | 'studio' | 'other';

export const PROPERTY_STATUSES: PropertyStatus[] = ['draft', 'published', 'rented', 'archived'];
export const PROPERTY_TYPES: PropertyType[] = ['apartment', 'house', 'townhouse', 'studio', 'other'];

/**
 * Allowed status transitions, as an adjacency list. Anything not listed here
 * is rejected — e.g. a 'draft' can't jump straight to 'rented' without ever
 * being published, and nothing can leave 'archived' once it's there.
 */
const ALLOWED_TRANSITIONS: Record<PropertyStatus, PropertyStatus[]> = {
  draft: ['published', 'archived'],
  published: ['rented', 'archived', 'draft'],
  rented: ['archived', 'published'], // e.g. tenant moves out, relist
  archived: [], // terminal state
};

export function isValidStatusTransition(from: PropertyStatus, to: PropertyStatus): boolean {
  if (from === to) return true; // no-op update (e.g. editing price without changing status)
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export interface PropertyInput {
  title?: string;
  address?: string;
  price?: number;
  bedrooms?: number;
  bathrooms?: number;
  size_m2?: number;
  property_type?: string;
  description?: string;
  features?: string[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates the fields required to CREATE a property. Kept separate from
 * Postgres constraints so the API can return a clear, specific error
 * message instead of a raw database error.
 */
export function validatePropertyInput(input: PropertyInput): ValidationResult {
  const errors: string[] = [];

  if (!input.title || input.title.trim().length === 0) {
    errors.push('Title is required.');
  } else if (input.title.length > 200) {
    errors.push('Title must be 200 characters or fewer.');
  }

  if (!input.address || input.address.trim().length === 0) {
    errors.push('Address is required.');
  } else if (input.address.length > 500) {
    errors.push('Address must be 500 characters or fewer.');
  }

  if (input.description !== undefined && input.description.length > 2000) {
    errors.push('Description must be 2000 characters or fewer.');
  }

  if (input.price === undefined || input.price === null) {
    errors.push('Price is required.');
  } else if (typeof input.price !== 'number' || Number.isNaN(input.price) || input.price <= 0) {
    errors.push('Price must be a positive number.');
  }

  if (input.property_type && !PROPERTY_TYPES.includes(input.property_type as PropertyType)) {
    errors.push(`property_type must be one of: ${PROPERTY_TYPES.join(', ')}.`);
  }

  if (input.bedrooms !== undefined && (typeof input.bedrooms !== 'number' || input.bedrooms < 0)) {
    errors.push('Bedrooms must be a non-negative number.');
  }

  if (input.bathrooms !== undefined && (typeof input.bathrooms !== 'number' || input.bathrooms < 0)) {
    errors.push('Bathrooms must be a non-negative number.');
  }

  return { valid: errors.length === 0, errors };
}
