import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scheduleDay, type DayPlanningInput, type FixedEvent, type PlanningTask, type TimeEntry } from '../src/scheduler';

const DATE = '2026-10-26';
const PREVIOUS_DATE = '2026-10-25';
const HOUR = 60;

function task(id: string, plannedMinutes: number, overrides: Partial<PlanningTask> = {}): PlanningTask {
  return { id, title: id, plannedDate: DATE, plannedMinutes, completed: false, ...overrides };
}
function event(id: string, startMinute: number, endMinute: number): FixedEvent {
  return { id, title: id, start: { date: DATE, minute: startMinute }, end: { date: DATE, minute: endMinute } };
}
function entry(id: string, taskId: string, startMinute: number, endMinute: number): TimeEntry {
  return { id, taskId, start: { date: DATE, minute: startMinute }, end: { date: DATE, minute: endMinute } };
}
function input(overrides: Partial<DayPlanningInput> = {}): DayPlanningInput {
  return {
    date: DATE, clock: { date: PREVIOUS_DATE, minute: 23 * HOUR },
    hours: { startMinute: 6 * HOUR, endMinute: 22 * HOUR },
    tasks: [task('typing', 45), task('project-review', 60), task('odin', 120), task('aerospace', 45)],
    ...overrides,
  };
}
function blocks(plan: ReturnType<typeof scheduleDay>) {
  return plan.scheduledBlocks.map(({ taskId, startMinute, endMinute }) => [taskId, startMinute, endMinute]);
}
function near(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) < 0.000001, `${actual} should be approximately ${expected}`);
}

test('the four-task example schedules exactly 4 hours 30 minutes in task-list order', () => {
  const plan = scheduleDay(input());
  assert.deepEqual(blocks(plan), [
    ['typing', 360, 405], ['project-review', 405, 465], ['odin', 465, 585], ['aerospace', 585, 630],
  ]);
  assert.equal(plan.summary.plannedMinutes, 270);
  assert.equal(plan.summary.scheduledMinutes, 270);
  assert.equal(plan.summary.unscheduledMinutes, 0);
  assert.equal(plan.summary.freeMinutes, 690);
});

test('a two-hour task splits into 1–2 PM and 4–5 PM around the 2–4 PM event', () => {
  const plan = scheduleDay(input({
    hours: { startMinute: 13 * HOUR, endMinute: 22 * HOUR },
    tasks: [task('project', 120)], events: [event('appointment', 14 * HOUR, 16 * HOUR)],
  }));
  assert.deepEqual(blocks(plan), [['project', 780, 840], ['project', 960, 1020]]);
  assert.equal(plan.tasks[0]!.scheduledMinutes, 120);
  assert.equal(plan.summary.fixedEventMinutes, 120);
  assert.equal(plan.summary.unscheduledMinutes, 0);
});

test('adding an event moves flexible work without changing the event or losing duration', () => {
  const base = input({ hours: { startMinute: 780, endMinute: 1320 }, tasks: [task('project', 120), task('typing', 45)] });
  assert.deepEqual(blocks(scheduleDay(base)), [['project', 780, 900], ['typing', 900, 945]]);
  const appointment = event('appointment', 840, 960);
  const before = JSON.stringify(appointment);
  const plan = scheduleDay({ ...base, events: [appointment] });
  assert.deepEqual(blocks(plan), [['project', 780, 840], ['project', 960, 1020], ['typing', 1020, 1065]]);
  assert.equal(plan.summary.scheduledMinutes, 165);
  assert.equal(JSON.stringify(appointment), before);
});

test('moving an event recalculates the schedule from its new boundaries', () => {
  const base = input({ hours: { startMinute: 780, endMinute: 1320 }, tasks: [task('project', 120)] });
  assert.deepEqual(blocks(scheduleDay({ ...base, events: [event('appointment', 840, 960)] })), [['project', 780, 840], ['project', 960, 1020]]);
  assert.deepEqual(blocks(scheduleDay({ ...base, events: [event('appointment', 900, 960)] })), [['project', 780, 900]]);
});

test('resizing an event pushes the remaining task work after its new end', () => {
  const plan = scheduleDay(input({ hours: { startMinute: 780, endMinute: 1320 }, tasks: [task('project', 120)], events: [event('appointment', 840, 1020)] }));
  assert.deepEqual(blocks(plan), [['project', 780, 840], ['project', 1020, 1080]]);
  assert.equal(plan.summary.scheduledMinutes, 120);
});

test('deleting an event restores the continuous free slot and deterministic block IDs', () => {
  const base = input({ hours: { startMinute: 780, endMinute: 1320 }, tasks: [task('project', 120)] });
  const original = scheduleDay(base);
  scheduleDay({ ...base, events: [event('appointment', 840, 960)] });
  assert.deepEqual(scheduleDay({ ...base, events: [] }), original);
});

test('multiple fixed events split one task across every necessary free gap', () => {
  const plan = scheduleDay(input({
    hours: { startMinute: 360, endMinute: 720 }, tasks: [task('project', 180)],
    events: [event('breakfast', 390, 420), event('lecture', 480, 600)],
  }));
  assert.deepEqual(blocks(plan), [['project', 360, 390], ['project', 420, 480], ['project', 600, 690]]);
});

test('overlapping fixed events count once for capacity and report their conflict', () => {
  const plan = scheduleDay(input({
    hours: { startMinute: 780, endMinute: 1320 }, tasks: [task('project', 120)],
    events: [event('first', 840, 960), event('second', 900, 1020)],
  }));
  assert.equal(plan.summary.fixedEventMinutes, 180);
  assert.equal(plan.summary.availableMinutes, 360);
  assert.deepEqual(plan.eventConflicts, [{ eventIds: ['first', 'second'], startMinute: 900, endMinute: 960 }]);
  assert.deepEqual(blocks(plan), [['project', 780, 840], ['project', 1020, 1080]]);
});

test('all overlapping event pairs are reported, including nested intervals', () => {
  const plan = scheduleDay(input({ events: [event('outer', 600, 900), event('inner', 660, 720), event('third', 690, 780)] }));
  assert.deepEqual(plan.eventConflicts.map((conflict) => conflict.eventIds), [['outer', 'inner'], ['outer', 'third'], ['inner', 'third']]);
  assert.equal(plan.summary.fixedEventMinutes, 300);
});

test('adjacent event endpoints do not conflict or create zero-length task blocks', () => {
  const plan = scheduleDay(input({
    hours: { startMinute: 780, endMinute: 1080 }, tasks: [task('project', 120)],
    events: [event('first', 840, 900), event('second', 900, 960)],
  }));
  assert.deepEqual(plan.eventConflicts, []);
  assert.deepEqual(blocks(plan), [['project', 780, 840], ['project', 960, 1020]]);
});

test('events outside daily hours stay visible but do not reduce scheduling capacity', () => {
  const plan = scheduleDay(input({ events: [event('early', 0, 300), event('late', 1320, 1439)] }));
  assert.equal(plan.events.length, 2);
  assert.equal(plan.summary.fixedEventMinutes, 0);
  assert.equal(plan.summary.availableMinutes, 960);
});

test('an event spanning midnight is clipped to the selected date without moving it', () => {
  const overnight: FixedEvent = {
    id: 'overnight', title: 'Overnight event',
    start: { date: PREVIOUS_DATE, minute: 1380 }, end: { date: DATE, minute: 420 },
  };
  const plan = scheduleDay(input({ tasks: [task('typing', 45)], events: [overnight] }));
  assert.deepEqual(plan.events, [{ id: 'overnight', title: 'Overnight event', startMinute: 0, endMinute: 420 }]);
  assert.deepEqual(blocks(plan), [['typing', 420, 465]]);
  assert.equal(plan.summary.fixedEventMinutes, 60);
});

test('overflow is reported per task and in total, without creating work on another day', () => {
  const plan = scheduleDay(input({ hours: { startMinute: 360, endMinute: 480 } }));
  assert.deepEqual(blocks(plan), [['typing', 360, 405], ['project-review', 405, 465], ['odin', 465, 480]]);
  assert.equal(plan.summary.scheduledMinutes, 120);
  assert.equal(plan.summary.unscheduledMinutes, 150);
  assert.deepEqual(plan.tasks.map((row) => [row.taskId, row.unscheduledMinutes]), [['typing', 0], ['project-review', 0], ['odin', 105], ['aerospace', 45]]);
  assert.ok(plan.scheduledBlocks.every((block) => block.date === DATE));
});

test('a fully occupied day leaves every remaining task visibly unscheduled', () => {
  const plan = scheduleDay(input({ events: [event('busy', 360, 1320)] }));
  assert.deepEqual(plan.scheduledBlocks, []);
  assert.equal(plan.summary.availableMinutes, 0);
  assert.equal(plan.summary.unscheduledMinutes, 270);
});

test('reordering tasks changes scheduling priority while keeping the total work', () => {
  const first = task('first', 90);
  const second = task('second', 60);
  const base = input({ hours: { startMinute: 360, endMinute: 480 }, tasks: [first, second] });
  assert.deepEqual(blocks(scheduleDay(base)), [['first', 360, 450], ['second', 450, 480]]);
  const reordered = scheduleDay({ ...base, tasks: [second, first] });
  assert.deepEqual(blocks(reordered), [['second', 360, 420], ['first', 420, 480]]);
  assert.equal(reordered.summary.unscheduledMinutes, 30);
});

test('editing an estimate recomputes that task and every later flexible block', () => {
  const base = input({ tasks: [task('first', 60), task('second', 45)] });
  assert.deepEqual(blocks(scheduleDay(base)), [['first', 360, 420], ['second', 420, 465]]);
  const edited = scheduleDay({ ...base, tasks: [task('first', 90), task('second', 45)] });
  assert.deepEqual(blocks(edited), [['first', 360, 450], ['second', 450, 495]]);
  assert.equal(edited.summary.plannedMinutes, 135);
});

test('editing daily hours moves work inside the new window and reports excess', () => {
  const base = input({ tasks: [task('project', 120)] });
  assert.deepEqual(blocks(scheduleDay(base)), [['project', 360, 480]]);
  const edited = scheduleDay({ ...base, hours: { startMinute: 600, endMinute: 690 } });
  assert.deepEqual(blocks(edited), [['project', 600, 690]]);
  assert.equal(edited.summary.unscheduledMinutes, 30);
});

test('today starts at the supplied current time, never in an earlier free gap', () => {
  const plan = scheduleDay(input({ clock: { date: DATE, minute: 495 }, tasks: [task('typing', 45)] }));
  assert.deepEqual(blocks(plan), [['typing', 495, 540]]);
  assert.equal(plan.planningStartMinute, 495);
});

test('before daily hours, today starts at the saved opening time', () => {
  const plan = scheduleDay(input({ clock: { date: DATE, minute: 300 }, tasks: [task('typing', 45)] }));
  assert.deepEqual(blocks(plan), [['typing', 360, 405]]);
});

test('a new task added during a fixed event starts when the event ends', () => {
  const plan = scheduleDay(input({ clock: { date: DATE, minute: 870 }, tasks: [task('typing', 45)], events: [event('event', 840, 960)] }));
  assert.deepEqual(blocks(plan), [['typing', 960, 1005]]);
});

test('after daily hours, today has zero remaining capacity', () => {
  const plan = scheduleDay(input({ clock: { date: DATE, minute: 1380 } }));
  assert.equal(plan.planningStartMinute, 1320);
  assert.deepEqual(plan.scheduledBlocks, []);
  assert.equal(plan.summary.unscheduledMinutes, 270);
});

test('future days start at 6 AM regardless of the current local time', () => {
  const plan = scheduleDay(input({ clock: { date: PREVIOUS_DATE, minute: 1439.5 }, tasks: [task('typing', 45)] }));
  assert.deepEqual(blocks(plan), [['typing', 360, 405]]);
});

test('past days retain history but never manufacture new work in the past', () => {
  const plan = scheduleDay(input({ clock: { date: '2026-10-27', minute: 300 } }));
  assert.deepEqual(plan.scheduledBlocks, []);
  assert.equal(plan.summary.availableMinutes, 0);
  assert.equal(plan.summary.unscheduledMinutes, 270);
});

test('completed task blocks and recorded work survive replanning unchanged', () => {
  const completed = { id: 'completed-block', taskId: 'done', date: DATE, startMinute: 780, endMinute: 840 };
  const logged = entry('entry', 'done', 780, 840);
  const plan = scheduleDay(input({
    clock: { date: DATE, minute: 900 }, tasks: [task('done', 60, { completed: true }), task('next', 60)],
    completedBlocks: [completed], timeEntries: [logged], events: [event('event', 960, 1020)],
  }));
  assert.deepEqual(plan.completedBlocks, [completed]);
  assert.deepEqual(plan.recordedBlocks.map(({ taskId, startMinute, endMinute }) => ({ taskId, startMinute, endMinute })), [{ taskId: 'done', startMinute: 780, endMinute: 840 }]);
  assert.deepEqual(blocks(plan), [['next', 900, 960]]);
  assert.equal(plan.tasks[0]!.remainingMinutes, 0);
  assert.equal(plan.tasks[0]!.actualMinutes, 60);
  assert.equal(plan.summary.recordedMinutes, 60);
  assert.equal(plan.summary.completedTaskCount, 1);
});

test('a completed task without timer history does not consume future capacity', () => {
  const plan = scheduleDay(input({ tasks: [task('done', 120, { completed: true }), task('next', 45)] }));
  assert.deepEqual(blocks(plan), [['next', 360, 405]]);
  assert.equal(plan.summary.plannedMinutes, 165);
  assert.equal(plan.summary.remainingWorkMinutes, 45);
});

test('a paused task schedules only its estimated work remaining after logged time', () => {
  const plan = scheduleDay(input({ clock: { date: DATE, minute: 840 }, tasks: [task('project', 120)], timeEntries: [entry('work', 'project', 780, 810)] }));
  assert.deepEqual(blocks(plan), [['project', 840, 930]]);
  assert.equal(plan.tasks[0]!.actualMinutes, 30);
  assert.equal(plan.tasks[0]!.remainingMinutes, 90);
});

test('the active task stays first even when it is lower in task-list order', () => {
  const activeTimer = { taskId: 'active', startedAt: { date: DATE, minute: 780 } };
  const plan = scheduleDay(input({
    clock: { date: DATE, minute: 810 }, tasks: [task('first-in-list', 60), task('active', 120)],
    activeTimer, events: [event('appointment', 840, 960)],
  }));
  assert.deepEqual(blocks(plan), [['active', 810, 840], ['active', 960, 1020], ['first-in-list', 1020, 1080]]);
  assert.deepEqual(plan.tasks.map((row) => row.taskId), ['first-in-list', 'active']);
  assert.equal(plan.tasks[1]!.actualMinutes, 30);
  assert.deepEqual(plan.activeTimer, activeTimer);
  assert.deepEqual(plan.recordedBlocks.map(({ startMinute, endMinute }) => [startMinute, endMinute]), [[780, 810]]);
});

test('replanning as a timer advances preserves its start and deducts new elapsed time', () => {
  const base = input({ clock: { date: DATE, minute: 810 }, tasks: [task('project', 120)], activeTimer: { taskId: 'project', startedAt: { date: DATE, minute: 780 } } });
  const first = scheduleDay(base);
  const second = scheduleDay({ ...base, clock: { date: DATE, minute: 825 } });
  assert.equal(first.tasks[0]!.remainingMinutes, 90);
  assert.equal(second.tasks[0]!.remainingMinutes, 75);
  assert.deepEqual(first.activeTimer, second.activeTimer);
  assert.equal(first.recordedBlocks[0]!.id, second.recordedBlocks[0]!.id);
  assert.deepEqual(blocks(second), [['project', 825, 900]]);
});

test('an overrun timer remains active without a negative estimate or negative capacity', () => {
  const activeTimer = { taskId: 'active', startedAt: { date: DATE, minute: 780 } };
  const plan = scheduleDay(input({ clock: { date: DATE, minute: 840 }, tasks: [task('next', 45), task('active', 45)], activeTimer }));
  assert.equal(plan.tasks[1]!.actualMinutes, 60);
  assert.equal(plan.tasks[1]!.remainingMinutes, 0);
  assert.equal(plan.tasks[1]!.unscheduledMinutes, 0);
  assert.deepEqual(plan.activeTimer, activeTimer);
  assert.deepEqual(blocks(plan), [['next', 840, 885]]);
});

test('a timer started at this exact clock instant reserves its remaining work first', () => {
  const plan = scheduleDay(input({ clock: { date: DATE, minute: 780 }, tasks: [task('first', 45), task('active', 60)], activeTimer: { taskId: 'active', startedAt: { date: DATE, minute: 780 } } }));
  assert.deepEqual(blocks(plan), [['active', 780, 840], ['first', 840, 885]]);
  assert.deepEqual(plan.recordedBlocks, []);
});

test('overlapping recorded/checkpointed timer intervals do not double-count actual time', () => {
  const plan = scheduleDay(input({
    clock: { date: DATE, minute: 840 }, tasks: [task('project', 120)],
    timeEntries: [entry('checkpoint', 'project', 780, 810)],
    activeTimer: { taskId: 'project', startedAt: { date: DATE, minute: 780 } },
  }));
  assert.equal(plan.tasks[0]!.actualMinutes, 60);
  assert.equal(plan.summary.recordedMinutes, 60);
  assert.deepEqual(blocks(plan), [['project', 840, 900]]);
});

test('fractional-minute elapsed work is not rounded away during replanning', () => {
  const plan = scheduleDay(input({ clock: { date: DATE, minute: 810.5 }, tasks: [task('project', 60)], activeTimer: { taskId: 'project', startedAt: { date: DATE, minute: 780 } } }));
  assert.equal(plan.tasks[0]!.actualMinutes, 30.5);
  assert.deepEqual(blocks(plan), [['project', 810.5, 840]]);
  near(plan.tasks[0]!.scheduledMinutes + plan.tasks[0]!.actualMinutes, 60);
});

test('one second of timer work keeps its precision instead of subtracting huge calendar values', () => {
  const plan = scheduleDay(input({
    clock: { date: DATE, minute: 780 + 1 / 60 }, tasks: [task('project', 60)],
    activeTimer: { taskId: 'project', startedAt: { date: DATE, minute: 780 } },
  }));
  assert.ok(Math.abs(plan.tasks[0]!.actualMinutes - 1 / 60) < 1e-10);
  near(plan.tasks[0]!.actualMinutes + plan.tasks[0]!.scheduledMinutes, 60);
});

test('work recorded outside daily hours is preserved rather than clipped out of history', () => {
  const plan = scheduleDay(input({ clock: { date: DATE, minute: 900 }, tasks: [task('project', 120)], timeEntries: [entry('early', 'project', 240, 300)] }));
  assert.equal(plan.recordedBlocks[0]!.startMinute, 240);
  assert.equal(plan.summary.recordedMinutes, 60);
  assert.deepEqual(blocks(plan), [['project', 900, 960]]);
});

test('moving a partly worked task to another date retains its existing actual time', () => {
  const plan = scheduleDay(input({ tasks: [task('project', 120)], timeEntries: [{ id: 'previous-work', taskId: 'project', start: { date: PREVIOUS_DATE, minute: 780 }, end: { date: PREVIOUS_DATE, minute: 840 } }] }));
  assert.equal(plan.tasks[0]!.actualMinutes, 60);
  assert.equal(plan.tasks[0]!.actualMinutesOnDate, 0);
  assert.deepEqual(plan.recordedBlocks, []);
  assert.deepEqual(blocks(plan), [['project', 360, 420]]);
});

test('midnight clips an active recording correctly and never moves yesterday’s task into today', () => {
  const activeTimer = { taskId: 'yesterday', startedAt: { date: PREVIOUS_DATE, minute: 1410 } };
  const plan = scheduleDay(input({
    clock: { date: DATE, minute: 30 }, tasks: [task('yesterday', 120, { plannedDate: PREVIOUS_DATE }), task('today', 45)], activeTimer,
  }));
  assert.deepEqual(blocks(plan), [['today', 360, 405]]);
  assert.deepEqual(plan.recordedBlocks.map(({ startMinute, endMinute }) => [startMinute, endMinute]), [[0, 30]]);
  assert.equal(plan.summary.recordedMinutes, 30);
  assert.deepEqual(plan.tasks.map((row) => row.taskId), ['today']);
  assert.deepEqual(plan.activeTimer, activeTimer);
});

test('closed recordings across midnight split by date without losing elapsed duration', () => {
  const work: TimeEntry = { id: 'overnight-work', taskId: 'project', start: { date: PREVIOUS_DATE, minute: 1410 }, end: { date: DATE, minute: 30 } };
  const base = input({ clock: { date: DATE, minute: 60 }, tasks: [task('project', 120)], timeEntries: [work] });
  const previous = scheduleDay({ ...base, date: PREVIOUS_DATE });
  const current = scheduleDay(base);
  assert.deepEqual(previous.recordedBlocks.map(({ startMinute, endMinute }) => [startMinute, endMinute]), [[1410, 1440]]);
  assert.deepEqual(current.recordedBlocks.map(({ startMinute, endMinute }) => [startMinute, endMinute]), [[0, 30]]);
  assert.equal(previous.summary.recordedMinutes + current.summary.recordedMinutes, 60);
  assert.equal(current.tasks[0]!.remainingMinutes, 60);
});

test('dated recurring-task instances remain independent after midnight and restart', () => {
  const base = input({
    clock: { date: DATE, minute: 0 },
    tasks: [task('typing:2026-10-25', 45, { completed: true, plannedDate: PREVIOUS_DATE }), task('typing:2026-10-26', 45)],
    timeEntries: [{ id: 'typing-log', taskId: 'typing:2026-10-25', start: { date: PREVIOUS_DATE, minute: 360 }, end: { date: PREVIOUS_DATE, minute: 405 } }],
  });
  const plan = scheduleDay(base);
  assert.equal(plan.tasks.length, 1);
  assert.equal(plan.tasks[0]!.actualMinutes, 0);
  assert.deepEqual(blocks(plan), [['typing:2026-10-26', 360, 405]]);
  assert.deepEqual(scheduleDay(JSON.parse(JSON.stringify(base)) as DayPlanningInput), plan);
});

test('backlog and other dates do not silently enter the selected day', () => {
  const plan = scheduleDay(input({ tasks: [task('backlog', 120, { plannedDate: null }), task('future', 60, { plannedDate: '2026-10-27' }), task('today', 45)] }));
  assert.deepEqual(blocks(plan), [['today', 360, 405]]);
  assert.equal(plan.summary.plannedMinutes, 45);
  assert.equal(plan.summary.taskCount, 1);
});

test('an empty task list still reports fixed events and remaining free capacity', () => {
  const plan = scheduleDay(input({ tasks: [], events: [event('appointment', 840, 960)] }));
  assert.deepEqual(plan.scheduledBlocks, []);
  assert.equal(plan.summary.fixedEventMinutes, 120);
  assert.equal(plan.summary.freeMinutes, 840);
  assert.equal(plan.summary.unscheduledMinutes, 0);
});

test('civil dates honor leap years, year changes, and end-of-day endpoints', () => {
  const leap = scheduleDay(input({ date: '2028-02-29', clock: { date: '2028-02-28', minute: 1439 }, tasks: [task('leap-task', 60, { plannedDate: '2028-02-29' })], hours: { startMinute: 1380, endMinute: 1440 } }));
  assert.deepEqual(blocks(leap), [['leap-task', 1380, 1440]]);
  const nextYear = scheduleDay(input({ date: '2027-01-01', clock: { date: '2026-12-31', minute: 1439 }, tasks: [task('new-year', 45, { plannedDate: '2027-01-01' })] }));
  assert.deepEqual(blocks(nextYear), [['new-year', 360, 405]]);
});

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) deepFreeze(item);
    Object.freeze(value);
  }
  return value;
}

test('frozen inputs are never mutated and outputs do not share mutable nested input objects', () => {
  const original = deepFreeze(input({
    clock: { date: DATE, minute: 810 }, tasks: [task('done', 45, { completed: true }), task('active', 120)],
    events: [event('event', 840, 960)], timeEntries: [entry('done-work', 'done', 600, 645)],
    completedBlocks: [{ id: 'done-block', taskId: 'done', date: DATE, startMinute: 600, endMinute: 645 }],
    activeTimer: { taskId: 'active', startedAt: { date: DATE, minute: 780 } },
  }));
  const serialized = JSON.stringify(original);
  const plan = scheduleDay(original);
  assert.equal(JSON.stringify(original), serialized);
  assert.notEqual(plan.hours, original.hours);
  assert.notEqual(plan.activeTimer, original.activeTimer);
  assert.notEqual(plan.activeTimer!.startedAt, original.activeTimer!.startedAt);
  assert.notEqual(plan.completedBlocks[0], original.completedBlocks![0]);
  assert.deepEqual(scheduleDay(original), plan);
});

test('500 deterministic generated days conserve work, avoid events, and match an independent capacity oracle', () => {
  let seed = 0x1a2b3c4d;
  function random(limit: number): number {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    return (seed >>> 0) % limit;
  }
  for (let iteration = 0; iteration < 500; iteration++) {
    const startMinute = random(1000);
    const endMinute = startMinute + 1 + random(1440 - startMinute);
    const events = Array.from({ length: random(10) }, (_, index) => {
      const start = random(1440);
      return event(`event-${index}`, start, start + 1 + random(1440 - start));
    });
    // end-of-day is represented as midnight of the following date in event inputs.
    const normalizedEvents = events.map((event) => event.end.minute === 1440 ? { ...event, end: { date: '2026-10-27', minute: 0 } } : event);
    const tasks = Array.from({ length: random(9) }, (_, index) => task(`task-${index}`, 1 + random(300)));
    const fixture = input({ hours: { startMinute, endMinute }, events: normalizedEvents, tasks });
    const plan = scheduleDay(fixture);
    const occupied = new Set<number>();
    for (const event of events) for (let minute = event.start.minute; minute < event.end.minute; minute++) occupied.add(minute);
    let capacity = 0;
    for (let minute = startMinute; minute < endMinute; minute++) if (!occupied.has(minute)) capacity++;
    const estimate = tasks.reduce((sum, task) => sum + task.plannedMinutes, 0);
    assert.equal(plan.summary.availableMinutes, capacity);
    assert.equal(plan.summary.scheduledMinutes, Math.min(estimate, capacity));
    assert.equal(plan.summary.unscheduledMinutes, Math.max(0, estimate - capacity));
    assert.equal(plan.summary.freeMinutes + plan.summary.scheduledMinutes, capacity);
    let previousEnd = startMinute;
    for (const block of plan.scheduledBlocks) {
      assert.ok(block.startMinute >= previousEnd && block.endMinute > block.startMinute);
      assert.ok(block.startMinute >= startMinute && block.endMinute <= endMinute);
      for (let minute = block.startMinute; minute < block.endMinute; minute++) assert.ok(!occupied.has(minute));
      previousEnd = block.endMinute;
    }
    let remainingCapacity = capacity;
    for (const row of plan.tasks) {
      assert.equal(row.scheduledMinutes, Math.min(row.plannedMinutes, remainingCapacity));
      assert.equal(row.scheduledMinutes + row.unscheduledMinutes, row.remainingMinutes);
      remainingCapacity -= row.scheduledMinutes;
    }
    assert.deepEqual(scheduleDay({ ...fixture, events: [...normalizedEvents].reverse() }), plan);
    assert.deepEqual(scheduleDay(JSON.parse(JSON.stringify(fixture)) as DayPlanningInput), plan);
  }
});

const invalidInputs: [string, DayPlanningInput][] = [
  ['non-ISO date', input({ date: '26/10/2026' })],
  ['impossible calendar date', input({ date: '2026-02-29' })],
  ['non-leap century', input({ date: '2100-02-29' })],
  ['year zero', input({ date: '0000-01-01' })],
  ['clock at minute 1440 instead of next-day midnight', input({ clock: { date: DATE, minute: 1440 } })],
  ['non-finite clock', input({ clock: { date: DATE, minute: NaN } })],
  ['reversed daily hours', input({ hours: { startMinute: 1320, endMinute: 360 } })],
  ['zero-length daily hours', input({ hours: { startMinute: 360, endMinute: 360 } })],
  ['negative daily start', input({ hours: { startMinute: -1, endMinute: 1320 } })],
  ['daily end after midnight', input({ hours: { startMinute: 360, endMinute: 1441 } })],
  ['zero estimate', input({ tasks: [task('bad', 0)] })],
  ['negative estimate', input({ tasks: [task('bad', -5)] })],
  ['fractional estimate', input({ tasks: [task('bad', 1.5)] })],
  ['infinite estimate', input({ tasks: [task('bad', Infinity)] })],
  ['unsafe combined estimates', input({ tasks: [task('a', Number.MAX_SAFE_INTEGER), task('b', 1)] })],
  ['empty task ID', input({ tasks: [task('', 45)] })],
  ['duplicate task IDs', input({ tasks: [task('same', 45), task('same', 60)] })],
  ['invalid task date', input({ tasks: [task('bad', 45, { plannedDate: '2026-04-31' })] })],
  ['duplicate event IDs', input({ events: [event('same', 600, 660), event('same', 700, 720)] })],
  ['reversed event', input({ events: [event('bad', 660, 600)] })],
  ['zero-length event', input({ events: [event('bad', 600, 600)] })],
  ['unknown recorded task', input({ timeEntries: [{ id: 'unknown', taskId: 'missing', start: { date: PREVIOUS_DATE, minute: 600 }, end: { date: PREVIOUS_DATE, minute: 660 } }] })],
  ['future recorded work', input({ timeEntries: [entry('future', 'typing', 600, 660)] })],
  ['reversed recorded work', input({ clock: { date: DATE, minute: 900 }, timeEntries: [entry('bad', 'typing', 660, 600)] })],
  ['duplicate recording IDs', input({ clock: { date: DATE, minute: 900 }, timeEntries: [entry('same', 'typing', 600, 660), entry('same', 'typing', 700, 720)] })],
  ['unknown active task', input({ activeTimer: { taskId: 'missing', startedAt: { date: PREVIOUS_DATE, minute: 600 } } })],
  ['completed active task', input({ tasks: [task('done', 45, { completed: true })], activeTimer: { taskId: 'done', startedAt: { date: PREVIOUS_DATE, minute: 600 } } })],
  ['future active-timer start', input({ activeTimer: { taskId: 'typing', startedAt: { date: DATE, minute: 600 } } })],
  ['completed block for incomplete task', input({ clock: { date: DATE, minute: 900 }, completedBlocks: [{ id: 'bad', taskId: 'typing', date: DATE, startMinute: 600, endMinute: 645 }] })],
  ['future completed history', input({ tasks: [task('done', 45, { completed: true })], completedBlocks: [{ id: 'bad', taskId: 'done', date: DATE, startMinute: 600, endMinute: 645 }] })],
];
for (const [description, fixture] of invalidInputs) {
  test(`rejects ${description} without mutating the input`, () => {
    const before = JSON.stringify(fixture);
    assert.throws(() => scheduleDay(deepFreeze(fixture)));
    assert.equal(JSON.stringify(fixture), before);
  });
}

test('an elapsed-clock actual total controls remaining work independently of local calendar projection',()=>{
  const plan=scheduleDay(input({clock:{date:DATE,minute:600},tasks:[task('typing',180,{actualMinutes:120})],timeEntries:[entry('dst-projection','typing',480,540)]}));
  assert.equal(plan.tasks[0]!.actualMinutes,120);assert.equal(plan.tasks[0]!.remainingMinutes,60);assert.equal(plan.summary.scheduledMinutes,60);
});
for(const actualMinutes of [-1,NaN,Infinity,Number.MAX_SAFE_INTEGER+1]) {
  test(`rejects invalid elapsed-clock total ${actualMinutes}`,()=>{
    assert.throws(()=>scheduleDay(input({tasks:[task('typing',45,{actualMinutes})]})),/Actual minutes/);
  });
}
