import type { PlannerBridge } from '../shared/contracts';

declare global {
  interface Window {
    planner: PlannerBridge;
  }
}
