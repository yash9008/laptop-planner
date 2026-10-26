import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

await build({
  entryPoints: ['src/scheduler/index.ts'], outfile: '.test-build/scheduler-demo.mjs',
  bundle: true, platform: 'neutral', format: 'esm', target: 'es2023',
});
const { scheduleDay } = await import(pathToFileURL(resolve('.test-build/scheduler-demo.mjs')).href);
const date = '2026-10-26';
const tasks = [
  { id: 'typing', title: 'Typing', plannedMinutes: 45 },
  { id: 'review', title: 'Project bug review', plannedMinutes: 60 },
  { id: 'odin', title: 'The Odin Project', plannedMinutes: 120 },
  { id: 'aerospace', title: 'Learn Aerospace', plannedMinutes: 45 },
].map((task) => ({ ...task, plannedDate: date, completed: false }));
const base = { date, clock: { date: '2026-10-25', minute: 0 }, hours: { startMinute: 360, endMinute: 1320 }, tasks };
function time(minute) {
  const hour = Math.floor(minute / 60);
  return `${hour % 12 || 12}:${String(minute % 60).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
}
function display(plan) {
  const titles = new Map(tasks.map((task) => [task.id, task.title]));
  console.table(plan.scheduledBlocks.map((block) => ({
    Task: titles.get(block.taskId) ?? block.taskId,
    Start: time(block.startMinute), End: time(block.endMinute), Minutes: block.endMinute - block.startMinute,
  })));
  console.log(`Scheduled: ${plan.summary.scheduledMinutes} min | Unscheduled: ${plan.summary.unscheduledMinutes} min | Free: ${plan.summary.freeMinutes} min`);
}

console.log('\nExample 1 — your four tasks: 4 hours 30 minutes\n');
display(scheduleDay(base));
console.log('\nExample 2 — two hours of project work, with a fixed 2–4 PM event\n');
display(scheduleDay({
  ...base, hours: { startMinute: 780, endMinute: 1320 }, tasks: [{ ...tasks[1], plannedMinutes: 120 }],
  events: [{ id: 'appointment', title: 'Fixed appointment', start: { date, minute: 840 }, end: { date, minute: 960 } }],
}));
console.log('\nThis demo uses in-memory fixtures only. It does not change your planner database.\n');
