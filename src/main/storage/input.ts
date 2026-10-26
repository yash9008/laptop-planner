import { dayNumber } from '../../scheduler/time';
import type { TaskActionInput } from '../../shared/contracts';

export class PlannerInputError extends Error {
  constructor(message: string, readonly code: 'VALIDATION_ERROR' | 'NOT_FOUND' = 'VALIDATION_ERROR') { super(message); }
}
export function object(value: unknown): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new PlannerInputError('Invalid planner request.');
}
export function date(value: unknown): asserts value is string {
  try { if (typeof value !== 'string') throw new Error(); dayNumber(value); }
  catch { throw new PlannerInputError('Choose a valid calendar date.'); }
}
export function id(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !value.trim()) throw new PlannerInputError('An identifier is required.');
}
export function action(input: unknown): asserts input is TaskActionInput { object(input); id(input.id); date(input.viewDate); }
