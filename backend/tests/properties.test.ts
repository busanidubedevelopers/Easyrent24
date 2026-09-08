import { describe, it, expect } from 'vitest';
import { isValidStatusTransition, validatePropertyInput } from '../lib/properties';

describe('isValidStatusTransition', () => {
  it('allows draft -> published', () => {
    expect(isValidStatusTransition('draft', 'published')).toBe(true);
  });
  it('allows draft -> archived', () => {
    expect(isValidStatusTransition('draft', 'archived')).toBe(true);
  });
  it('blocks draft -> rented (must publish first)', () => {
    expect(isValidStatusTransition('draft', 'rented')).toBe(false);
  });
  it('allows published -> rented', () => {
    expect(isValidStatusTransition('published', 'rented')).toBe(true);
  });
  it('allows published -> draft (unpublish)', () => {
    expect(isValidStatusTransition('published', 'draft')).toBe(true);
  });
  it('allows rented -> archived', () => {
    expect(isValidStatusTransition('rented', 'archived')).toBe(true);
  });
  it('allows rented -> published (relist)', () => {
    expect(isValidStatusTransition('rented', 'published')).toBe(true);
  });
  it('blocks any transition out of archived (terminal state)', () => {
    expect(isValidStatusTransition('archived', 'draft')).toBe(false);
    expect(isValidStatusTransition('archived', 'published')).toBe(false);
  });
  it('allows a same-state no-op update', () => {
    expect(isValidStatusTransition('published', 'published')).toBe(true);
  });
});

describe('validatePropertyInput', () => {
  it('accepts valid input', () => {
    expect(validatePropertyInput({ title: 'Nice Flat', address: '1 Main St', price: 5000 }).valid).toBe(true);
  });
  it('rejects missing title', () => {
    expect(validatePropertyInput({ address: '1 Main St', price: 5000 }).valid).toBe(false);
  });
  it('rejects missing address', () => {
    expect(validatePropertyInput({ title: 'X', price: 5000 }).valid).toBe(false);
  });
  it('rejects missing price', () => {
    expect(validatePropertyInput({ title: 'X', address: 'Y' }).valid).toBe(false);
  });
  it('rejects negative price', () => {
    expect(validatePropertyInput({ title: 'X', address: 'Y', price: -100 }).valid).toBe(false);
  });
  it('rejects zero price', () => {
    expect(validatePropertyInput({ title: 'X', address: 'Y', price: 0 }).valid).toBe(false);
  });
  it('rejects an invalid property_type', () => {
    expect(
      validatePropertyInput({ title: 'X', address: 'Y', price: 100, property_type: 'castle' }).valid
    ).toBe(false);
  });
  it('accepts a valid property_type', () => {
    expect(
      validatePropertyInput({ title: 'X', address: 'Y', price: 100, property_type: 'studio' }).valid
    ).toBe(true);
  });
  it('rejects negative bedrooms', () => {
    expect(validatePropertyInput({ title: 'X', address: 'Y', price: 100, bedrooms: -1 }).valid).toBe(false);
  });
  it('rejects a title over 200 characters', () => {
    expect(validatePropertyInput({ title: 'x'.repeat(201), address: 'Y', price: 100 }).valid).toBe(false);
  });
});
