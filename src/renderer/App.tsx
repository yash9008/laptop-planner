import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import type { PlannerDay, PlannerResult, PlannerTask, PlannerProject, PlannerEvent, SaveProjectInput, SaveEventInput, SaveSettingsInput, MoveTaskInput } from '../shared/contracts';
import { dateLabel, formatDuration, formatTime, shiftDate, formatElapsed, parseDuration, WEEKDAYS } from '../shared/task-input';
import { creationDraftKey, isDraftDirty, newCreationDraft, taskToDraft, reconcileTaskDraft, type TaskDraft } from './drafts';
import { DayCalendar } from './components/DayCalendar';
import { Icon } from './components/Icon';
import { StorageDialog } from './components/StorageDialog';
import { TaskEditor } from './components/TaskEditor';
import { QuickAddComposer } from './components/QuickAddComposer';
import { EstimatePopover } from './components/EstimatePopover';
import { TaskMenu } from './components/TaskMenu';
import { ProjectEditor } from './components/ProjectEditor';
import { EventEditor } from './components/EventEditor';
import { FocusBar } from './components/FocusBar';
import { PlanningBoard } from './components/PlanningBoard';
import { useBoardDrag } from './components/BoardDrag';
import { CalendarDock, readCalendarWidth } from './components/CalendarDock';
import { DailyWorkload } from './components/DailyWorkload';
import { FilterChooser } from './components/FilterChooser';
import { SearchPanel } from './components/SearchPanel';
import { BacklogPanel } from './components/BacklogPanel';
import { RecoveryPanel } from './components/RecoveryPanel';
import { CommandPalette, type CommandItem } from './components/CommandPalette';
import { KeyboardHelpDialog } from './components/KeyboardHelpDialog';
import { FocusScreen } from './components/FocusScreen';

type TaskSurface = 'board' | 'search' | 'backlog' | 'recovery' | 'calendar' | 'focus' | 'other';
type TaskOrigin = { element: HTMLElement | null; taskId: string | null; surface: TaskSurface };

export function App() {
  const [day, setDay] = useState<PlannerDay | null>(null);
  const [view, setView] = useState<'day' | 'board' | 'backlog' | 'project' | 'focus'>('board');
  const [boardNavigationKey, setBoardNavigationKey] = useState(0);
  const [boardCalendarDate, setBoardCalendarDate] = useState<string | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(true);
  const [calendarWidth, setCalendarWidth] = useState(readCalendarWidth);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterAnchor, setFilterAnchor] = useState<HTMLElement | null>(null);
  const [filterQuery, setFilterQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'incomplete' | 'completed'>('all');
  const [filterProjectId, setFilterProjectId] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeUtilityPanel, setActiveUtilityPanel] = useState<'backlog' | 'search' | 'recovery' | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [projectEditor, setProjectEditor] = useState<PlannerProject | null | undefined>(undefined);
  const [eventEditor, setEventEditor] = useState<{ event: PlannerEvent | null; minute: number } | null>(null);

  // Command Palette & Keyboard & Focus states
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [keyboardHelpOpen, setKeyboardHelpOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const selectedTaskIdRef = useRef<string | null>(null);
  selectedTaskIdRef.current = selectedTaskId;
  const pendingHelpRestore = useRef(false);
  const [focusTaskId, setFocusTaskId] = useState<string | null>(null);
  const previousViewRef = useRef<'board' | 'day' | 'backlog' | 'project'>('board');
  const focusExitOriginRef = useRef<TaskOrigin | null>(null);
  const pendingFocusRestore = useRef(false);

  // Drafts & Task UI state
  const [creationDrafts, setCreationDrafts] = useState<Record<string, TaskDraft>>({});
  const [existingDrafts, setExistingDrafts] = useState<Record<string, TaskDraft>>({});
  const initialCreationDrafts = useRef<Record<string, TaskDraft>>({});
  const initialExistingDrafts = useRef<Record<string, TaskDraft>>({});
  const [activeCreation, setActiveCreation] = useState<{ key: string; targetDate: string | null; projectId: string } | null>(null);
  const [activeTask, setActiveTask] = useState<PlannerTask | null>(null);
  const [activeEditorMode, setActiveEditorMode] = useState<'quick' | 'details' | null>(null);
  const [activeEstimatePopover, setActiveEstimatePopover] = useState<{
    task: PlannerTask;
    anchor: HTMLElement;
    error?: string | null;
    attemptedValue?: string;
  } | null>(null);
  const [activeTaskMenu, setActiveTaskMenu] = useState<{ task: PlannerTask; anchor: HTMLElement } | null>(null);
  const originatingElement = useRef<HTMLElement | null>(null);
  const originatingTaskId = useRef<string | null>(null);
  const originatingSurface = useRef<TaskSurface>('board');
  const [activeSearchResultId, setActiveSearchResultId] = useState<string | null>(null);
  const prevActiveUtilityPanel = useRef<'backlog' | 'search' | 'recovery' | null>(null);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [storageOpen, setStorageOpen] = useState(false);
  const [storageTitle, setStorageTitle] = useState('Local storage');
  const [deleted, setDeleted] = useState<{ id: string; title: string } | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const sequence = useRef(0);
  const busyRef = useRef(false);
  const dateRef = useRef<string | undefined>(undefined);
  const followingToday = useRef(true);
  const runningRef = useRef(false);
  runningRef.current = Boolean(day?.focus?.running);

  const refresh = useCallback(async (date?: string, quiet = false) => {
    if (busyRef.current) return;
    const ticket = ++sequence.current;
    if (!quiet) setLoading(true);
    try {
      const result = await window.planner.getDay(date);
      if (ticket !== sequence.current) return;
      if (result.ok) {
        setDay(result.value);
        dateRef.current = result.value.date;
        if (!quiet) setError(null);
      } else setError(result.error.message);
    } catch {
      if (ticket === sequence.current) setError('The local planner bridge is unavailable. Close and reopen Laptop Planner to try again.');
    } finally {
      if (ticket === sequence.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const sync = () => {
      if (document.visibilityState === 'visible') void refresh(followingToday.current ? undefined : dateRef.current, true);
    };
    const timer = window.setInterval(sync, 60_000);
    const focusTick = window.setInterval(() => {
      if (runningRef.current) sync();
    }, 1000);
    const unsubscribe = window.planner.onPlannerChanged(sync);
    window.addEventListener('focus', sync);
    return () => {
      window.clearInterval(timer);
      window.clearInterval(focusTick);
      unsubscribe();
      window.removeEventListener('focus', sync);
      sequence.current++;
    };
  }, [refresh]);

  async function commit(operation: () => Promise<PlannerResult<PlannerDay>>): Promise<string | null> {
    if (busyRef.current) return 'Please wait for the current change to finish saving.';
    busyRef.current = true;
    setBusy(true);
    ++sequence.current;
    try {
      const result = await operation();
      if (!result.ok) {
        setError(result.error.message);
        return result.error.message;
      }
      setDay(result.value);
      dateRef.current = result.value.date;
      setError(null);
      return null;
    } catch {
      const message = 'Your change could not be confirmed. Refresh the day before trying again; your form has been kept.';
      setError(message);
      return message;
    } finally {
      busyRef.current = false;
      setBusy(false);
      setLoading(false);
    }
  }

  const pendingRestoreFocus = useRef(false);

  useEffect(() => {
    if (activeEditorMode === null && pendingRestoreFocus.current) {
      pendingRestoreFocus.current = false;
      restoreOriginatingFocus(originatingTaskId.current);
    }
  }, [activeEditorMode]);

  useEffect(() => {
    if (prevActiveUtilityPanel.current && !activeUtilityPanel) {
      const closed = prevActiveUtilityPanel.current;
      let selector = '';
      if (closed === 'search') selector = 'button[aria-label="Open search panel"]';
      else if (closed === 'backlog') selector = 'button[aria-label="Open backlog panel"]';
      else if (closed === 'recovery') selector = 'button[aria-label="Open recovery panel"]';
      const opener = document.querySelector<HTMLElement>(selector);
      opener?.focus({ preventScroll: true });
    }
    prevActiveUtilityPanel.current = activeUtilityPanel;
  }, [activeUtilityPanel]);

  function captureTaskOrigin(taskId: string | null, element?: HTMLElement, surface?: TaskSurface) {
    const trigger = element ??
      (document.activeElement instanceof HTMLElement && document.activeElement !== document.body
        ? document.activeElement
        : null);
    originatingElement.current = trigger;
    originatingTaskId.current = taskId;
    originatingSurface.current = surface ??
      (trigger?.closest('[data-testid="search-panel"]') ? 'search'
        : trigger?.closest('[data-testid="backlog-panel"]') ? 'backlog'
        : trigger?.closest('[data-testid="recovery-panel"]') ? 'recovery'
        : trigger?.closest('.calendar-panel') ? 'calendar'
        : trigger?.closest('.focus-screen') ? 'focus'
        : 'board');
    return originatingSurface.current;
  }

  function snapshotTaskOrigin(): TaskOrigin {
    return { element: originatingElement.current, taskId: originatingTaskId.current, surface: originatingSurface.current };
  }

  function restoreOriginatingFocus(taskId?: string | null, origin?: TaskOrigin) {
    const surface = origin ? origin.surface : originatingSurface.current;
    const originElement = origin ? origin.element : originatingElement.current;

    if (surface === 'focus') {
      const focusScreen = document.querySelector<HTMLElement>('[data-testid="focus-screen"], .focus-screen');
      if (focusScreen && focusScreen.isConnected) {
        const el = originElement;
        if (el && el.isConnected && focusScreen.contains(el)) {
          el.focus({ preventScroll: true });
          return;
        }
        const focusBtn = focusScreen.querySelector<HTMLElement>('button.button, button');
        if (focusBtn && focusBtn.isConnected) {
          focusBtn.focus({ preventScroll: true });
          return;
        }
        focusScreen.focus({ preventScroll: true });
        return;
      }
    }

    if (surface === 'search') {
      const searchPanel = document.querySelector<HTMLElement>('[data-testid="search-panel"]');
      if (searchPanel && searchPanel.isConnected) {
        const el = originElement;
        if (el && el.isConnected && searchPanel.contains(el)) {
          el.focus({ preventScroll: true });
          return;
        }
        if (taskId) {
          const taskBtn = searchPanel.querySelector<HTMLElement>(`[data-task-id="${taskId}"] .search-result-main`);
          if (taskBtn && taskBtn.isConnected) {
            taskBtn.focus({ preventScroll: true });
            return;
          }
        }
        const remainingResult = searchPanel.querySelector<HTMLElement>('.search-result-main');
        if (remainingResult && remainingResult.isConnected) {
          remainingResult.focus({ preventScroll: true });
          return;
        }
        const searchInput = searchPanel.querySelector<HTMLElement>('input[aria-label="Search all tasks"], input');
        if (searchInput && searchInput.isConnected) {
          searchInput.focus({ preventScroll: true });
          return;
        }
        searchPanel.focus({ preventScroll: true });
        return;
      }
    }

    if (surface === 'backlog') {
      const backlogPanel = document.querySelector<HTMLElement>('[data-testid="backlog-panel"]');
      if (backlogPanel && backlogPanel.isConnected) {
        const el = originElement;
        if (el && el.isConnected && backlogPanel.contains(el)) {
          el.focus({ preventScroll: true });
          return;
        }
        if (taskId) {
          const taskBtn = backlogPanel.querySelector<HTMLElement>(`[data-task-id="${taskId}"] .task-title`);
          if (taskBtn && taskBtn.isConnected) {
            taskBtn.focus({ preventScroll: true });
            return;
          }
        }
        const remaining = backlogPanel.querySelector<HTMLElement>('.task-title');
        if (remaining && remaining.isConnected) {
          remaining.focus({ preventScroll: true });
          return;
        }
        const closeBtn = backlogPanel.querySelector<HTMLElement>('button[aria-label="Close backlog panel"]');
        if (closeBtn && closeBtn.isConnected) {
          closeBtn.focus({ preventScroll: true });
          return;
        }
        backlogPanel.focus({ preventScroll: true });
        return;
      }
    }

    if (surface === 'recovery') {
      const recoveryPanel = document.querySelector<HTMLElement>('[data-testid="recovery-panel"]');
      if (recoveryPanel && recoveryPanel.isConnected) {
        const el = originElement;
        if (el && el.isConnected && recoveryPanel.contains(el)) {
          el.focus({ preventScroll: true });
          return;
        }
        const fallback = recoveryPanel.querySelector<HTMLElement>('button');
        if (fallback && fallback.isConnected) {
          fallback.focus({ preventScroll: true });
          return;
        }
        recoveryPanel.focus({ preventScroll: true });
        return;
      }
    }

    const el = originElement;
    if (el && el.isConnected) {
      el.focus({ preventScroll: true });
      return;
    }
    if (taskId) {
      const card =
        document.querySelector<HTMLElement>(`[data-task-id="${taskId}"] .task-title`) ??
        document.querySelector<HTMLElement>(`[data-task-id="${taskId}"]`);
      if (card && card.isConnected) {
        card.focus({ preventScroll: true });
        return;
      }
    }
    const fallback =
      document.querySelector<HTMLElement>('.toolbar-add') ??
      document.querySelector<HTMLElement>('.planning-board') ??
      document.querySelector<HTMLElement>('.planner-main');
    fallback?.focus({ preventScroll: true });
  }

  const isFilterActive = filterQuery.trim() !== '' || filterStatus !== 'all' || filterProjectId !== 'all';

  function clearFilters() {
    setFilterQuery('');
    setFilterStatus('all');
    setFilterProjectId('all');
  }

  function goToDate(date?: string) {
    setBoardCalendarDate(null);
    setBoardNavigationKey((value) => value + 1);
    followingToday.current = date === undefined || date === day?.today;
    void refresh(date);
  }

  function openNew(
    targetDate?: string | null,
    originatingEl?: HTMLElement
  ) {
    const computedTargetDate =
      targetDate !== undefined
        ? targetDate
        : (view === 'backlog' || view === 'project'
        ? null
        : (view === 'board' ? boardCalendarDate : null) ?? day?.date ?? null);
    captureTaskOrigin(null, originatingEl);
    const projectId = view === 'project' ? selectedProjectId : '';
    const key = creationDraftKey(computedTargetDate, projectId);

    setCreationDrafts((prev) => {
      const existing = prev[key];
      if (!existing) {
        const draft = newCreationDraft(computedTargetDate, projectId);
        initialCreationDrafts.current[key] = { ...draft };
        return { ...prev, [key]: draft };
      }
      if (!initialCreationDrafts.current[key]) {
        initialCreationDrafts.current[key] = { ...existing };
      }
      return prev;
    });

    setActiveCreation({ key, targetDate: computedTargetDate, projectId });
    setActiveTask(null);
    setActiveEditorMode('quick');
  }

  function openEditor(
    task: PlannerTask,
    originatingEl?: HTMLElement,
    surface?: TaskSurface
  ) {
    const detectedSurface = captureTaskOrigin(task.id, originatingEl, surface);
    if (detectedSurface === 'search') {
      setActiveSearchResultId(task.id);
    }
    setSelectedTaskId(task.id);

    const latestTask = day?.allTasks.find((t) => t.id === task.id) ?? task;
    const freshDraft = taskToDraft(latestTask, day?.date ?? '2026-01-01');

    setExistingDrafts((prev) => {
      const existing = prev[latestTask.id];
      const initial = initialExistingDrafts.current[latestTask.id];
      if (!existing || !initial) {
        initialExistingDrafts.current[latestTask.id] = { ...freshDraft };
        return { ...prev, [latestTask.id]: freshDraft };
      }
      const reconciled = reconcileTaskDraft(existing, initial, freshDraft);
      initialExistingDrafts.current[latestTask.id] = reconciled.initial;
      return { ...prev, [latestTask.id]: reconciled.draft };
    });

    setActiveTask(latestTask);
    setActiveCreation(null);
    setActiveEditorMode('details');
  }

  function dismissActiveSurface() {
    if (busy) return;
    pendingRestoreFocus.current = true;
    setActiveCreation(null);
    setActiveTask(null);
    setActiveEditorMode(null);
  }

  function discardActiveDraft() {
    if (busy) return;
    if (activeCreation) {
      const key = activeCreation.key;
      setCreationDrafts((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      delete initialCreationDrafts.current[key];
    } else if (activeTask) {
      const id = activeTask.id;
      setExistingDrafts((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      delete initialExistingDrafts.current[id];
    }
    dismissActiveSurface();
  }

  function updateCreationDraft(key: string, updated: TaskDraft) {
    setCreationDrafts((prev) => ({ ...prev, [key]: updated }));
  }

  function updateExistingDraft(id: string, updated: TaskDraft) {
    setExistingDrafts((prev) => ({ ...prev, [id]: updated }));
  }

  async function submitCreationDraft(): Promise<string | null> {
    if (!activeCreation || !day) return null;
    const draft = creationDrafts[activeCreation.key];
    if (!draft) return null;

    if (!draft.title.trim()) {
      updateCreationDraft(activeCreation.key, { ...draft, error: 'Give this task a title.' });
      return 'Give this task a title.';
    }
    const plannedMinutes = parseDuration(draft.estimate);
    if (plannedMinutes === null) {
      updateCreationDraft(activeCreation.key, {
        ...draft,
        error: 'Enter a positive duration, such as 45m, 2h, or 1h 30m.',
      });
      return 'Enter a positive duration, such as 45m, 2h, or 1h 30m.';
    }
    if (!draft.backlog && !draft.plannedDate) {
      updateCreationDraft(activeCreation.key, { ...draft, error: 'Choose a day for this task.' });
      return 'Choose a day for this task.';
    }

    const creationId = draft.creationId;
    const message = await commit(() =>
      window.planner.saveTask({
        id: creationId,
        create: true,
        title: draft.title,
        notes: draft.notes,
        plannedDate: draft.backlog ? null : draft.plannedDate,
        plannedMinutes,
        viewDate: day.date,
        projectId: draft.projectId || null,
        deadline: draft.deadline || null,
        recurrence:
          draft.repeat !== 'never'
            ? { weekdays: draft.repeat === 'daily' ? [0, 1, 2, 3, 4, 5, 6] : draft.weekdays }
            : undefined,
        stopRepeats: draft.stopRepeats,
      })
    );

    if (message) {
      updateCreationDraft(activeCreation.key, { ...draft, error: message });
      return message;
    }

    const key = activeCreation.key;
    setCreationDrafts((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    delete initialCreationDrafts.current[key];
    dismissActiveSurface();
    return null;
  }

  async function submitExistingTaskDraft(): Promise<string | null> {
    if (!activeTask || !day) return null;
    const draft = existingDrafts[activeTask.id];
    if (!draft) return null;

    if (!draft.title.trim()) {
      updateExistingDraft(activeTask.id, { ...draft, error: 'Give this task a title.' });
      return 'Give this task a title.';
    }
    const plannedMinutes = parseDuration(draft.estimate);
    if (plannedMinutes === null) {
      updateExistingDraft(activeTask.id, {
        ...draft,
        error: 'Enter a positive duration, such as 45m, 2h, or 1h 30m.',
      });
      return 'Enter a positive duration, such as 45m, 2h, or 1h 30m.';
    }
    if (!draft.backlog && !draft.plannedDate) {
      updateExistingDraft(activeTask.id, { ...draft, error: 'Choose a day for this task.' });
      return 'Choose a day for this task.';
    }

    const template = day.recurrences.find((row) => row.id === activeTask.recurrenceId);
    const message = await commit(() =>
      window.planner.saveTask({
        id: activeTask.id,
        create: false,
        title: draft.title,
        notes: draft.notes,
        plannedDate: draft.backlog ? null : draft.plannedDate,
        plannedMinutes,
        viewDate: day.date,
        projectId: draft.projectId || null,
        deadline: draft.deadline || null,
        recurrence:
          !template && draft.repeat !== 'never'
            ? { weekdays: draft.repeat === 'daily' ? [0, 1, 2, 3, 4, 5, 6] : draft.weekdays }
            : undefined,
        stopRepeats: draft.stopRepeats,
      })
    );

    if (message) {
      updateExistingDraft(activeTask.id, { ...draft, error: message });
      return message;
    }

    const id = activeTask.id;
    setExistingDrafts((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    delete initialExistingDrafts.current[id];
    dismissActiveSurface();
    return null;
  }

  async function saveStandaloneEstimate(minutes: number, formatted?: string) {
    if (!activeEstimatePopover || !day) return;
    const { task } = activeEstimatePopover;
    const currentTask = day.allTasks.find((t) => t.id === task.id) ?? task;
    const durationStr = formatted ?? formatDuration(minutes);

    setActiveEstimatePopover((prev) => (prev ? { ...prev, error: null, attemptedValue: durationStr } : null));

    const message = await commit(() =>
      window.planner.saveTask({
        id: currentTask.id,
        create: false,
        title: currentTask.title,
        notes: currentTask.notes,
        plannedDate: currentTask.plannedDate,
        plannedMinutes: minutes,
        viewDate: day.date,
        projectId: currentTask.projectId,
        deadline: currentTask.deadline,
      })
    );

    if (!message) {
      setExistingDrafts((prev) => {
        const existing = prev[currentTask.id];
        const initial = initialExistingDrafts.current[currentTask.id];
        if (!existing) return prev;
        const newDuration = formatDuration(minutes);
        const shouldUpdateDraft = !initial || existing.estimate === initial.estimate;
        if (initial) {
          initialExistingDrafts.current[currentTask.id] = {
            ...initial,
            estimate: newDuration,
          };
        }
        if (shouldUpdateDraft) {
          return {
            ...prev,
            [currentTask.id]: {
              ...existing,
              estimate: newDuration,
            },
          };
        }
        return prev;
      });

      setActiveEstimatePopover(null);
      restoreOriginatingFocus(originatingTaskId.current);
    } else {
      setActiveEstimatePopover((prev) =>
        prev
          ? {
              ...prev,
              task: currentTask,
              error: message,
              attemptedValue: durationStr,
            }
          : null
      );
    }
  }

  async function saveSettings(input: SaveSettingsInput) {
    const message = await commit(() => window.planner.saveSettings(input));
    if (!message) await refresh(followingToday.current ? undefined : dateRef.current);
    return message;
  }

  async function afterRestore() {
    dismissActiveSurface();
    setActiveEstimatePopover(null);
    setActiveTaskMenu(null);
    setCreationDrafts({});
    setExistingDrafts({});
    setEventEditor(null);
    setProjectEditor(undefined);
    setDeleted(null);
    setSelectedProjectId('');
    clearFilters();
    setSearchQuery('');
    setActiveUtilityPanel(null);
    setView('board');
    setBoardCalendarDate(null);
    setBoardNavigationKey((value) => value + 1);
    followingToday.current = true;
    await refresh();
  }

  async function saveProject(input: SaveProjectInput) {
    const message = await commit(() => window.planner.saveProject(input));
    if (!message) setProjectEditor(undefined);
    return message;
  }

  async function saveEvent(input: SaveEventInput) {
    const message = await commit(() => window.planner.saveEvent({ ...input, viewDate: day?.date ?? input.viewDate }));
    if (!message) setEventEditor(null);
    return message;
  }

  async function changeEvent(event: PlannerEvent) {
    if (!day) return 'Open a day first.';
    return commit(() => window.planner.saveEvent({ ...event, viewDate: day.date }));
  }

  function addEvent(minute?: number) {
    if (displayDay)
      setEventEditor({
        event: null,
        minute:
          minute ??
          (displayDay.date === displayDay.today ? Math.min(1425, Math.ceil(displayDay.clock.minute / 15) * 15) : 540),
      });
  }

  async function moveTask(id: string, date: string | null) {
    const task = day?.allTasks.find((task) => task.id === id);
    if (day && task && task.plannedDate !== date)
      await commit(() => window.planner.saveTask({ ...task, plannedDate: date, viewDate: day.date }));
  }

  async function moveBoardTask(input: MoveTaskInput) {
    return commit(() => window.planner.moveTask(input));
  }

  const boardPanelRef = useRef<HTMLElement | null>(null);
  const dnd = useBoardDrag({
    panel: boardPanelRef,
    tasks: day?.allTasks ?? [],
    busy,
    viewDate: day?.date ?? '',
    onMove: moveBoardTask,
  });

  async function remove(task: PlannerTask) {
    if (!day) return;
    if (activeTask?.id === task.id) {
      dismissActiveSurface();
    }
    const message = await commit(() => window.planner.deleteTask({ id: task.id, viewDate: day.date }));
    if (!message) {
      if (selectedTaskId === task.id) {
        setSelectedTaskId(null);
      }
      setExistingDrafts((prev) => {
        const next = { ...prev };
        delete next[task.id];
        return next;
      });
      delete initialExistingDrafts.current[task.id];
      setDeleted({ id: task.id, title: task.title });
    }
  }

  async function reorder(taskId: string, targetId: string) {
    if (!day || view !== 'day' || taskId === targetId) return;
    const ordered = day.tasks.filter((task) => !task.completed).map((task) => task.id);
    const from = ordered.indexOf(taskId);
    const to = ordered.indexOf(targetId);
    if (from < 0 || to < 0) return;
    ordered.splice(from, 1);
    ordered.splice(to, 0, taskId);
    await commit(() =>
      window.planner.reorderTasks({
        date: day.date,
        taskIds: [...ordered, ...day.tasks.filter((task) => task.completed).map((task) => task.id)],
      })
    );
  }

  const workspaceView = view === 'focus' ? previousViewRef.current : view;
  const calendarColumn = workspaceView === 'board' ? day?.board.find((column) => column.date === boardCalendarDate) : undefined;
  const displayDay =
    day && calendarColumn
      ? {
          ...day,
          date: calendarColumn.date,
          tasks: calendarColumn.tasks,
          plan: calendarColumn.plan,
          actualMinutesOnDate: calendarColumn.actualMinutesOnDate,
        }
      : day;
  const selectedProject = day?.projects.find((project) => project.id === selectedProjectId);
  const visibleTasks =
    workspaceView === 'backlog'
      ? day?.backlog ?? []
      : workspaceView === 'project'
      ? day?.allTasks.filter((task) => task.projectId === selectedProjectId) ?? []
      : day?.tasks ?? [];
  const matches = (task: PlannerTask) => {
    const q = filterQuery.trim().toLowerCase();
    if (q) {
      const proj = day?.projects.find((project) => project.id === task.projectId);
      const text = `${task.title} ${task.notes || ''} ${proj?.title ?? ''}`.toLowerCase();
      if (!text.includes(q)) return false;
    }
    if (filterStatus === 'incomplete' && task.completed) return false;
    if (filterStatus === 'completed' && !task.completed) return false;
    if (filterProjectId === 'none' && task.projectId) return false;
    if (filterProjectId !== 'all' && filterProjectId !== 'none' && task.projectId !== filterProjectId) return false;
    return true;
  };
  const filteredTasks = visibleTasks.filter(matches);
  const incomplete = filteredTasks.filter((task) => !task.completed);
  const completed = filteredTasks.filter((task) => task.completed);
  const dayHeading =
    day?.date === day?.today
      ? 'Today'
      : day?.date === (day && shiftDate(day.today, 1))
      ? 'Tomorrow'
      : day
      ? dateLabel(day.date, { weekday: 'long' })
      : 'Today';
  const heading =
    view === 'board'
      ? 'Your week'
      : view === 'backlog'
      ? 'Backlog'
      : view === 'project'
      ? selectedProject?.title ?? 'Project'
      : view === 'focus'
      ? 'Focus'
      : dayHeading;

  const isAnyModalActive =
    activeEditorMode !== null ||
    activeEstimatePopover !== null ||
    activeTaskMenu !== null ||
    filterOpen ||
    eventEditor !== null ||
    projectEditor !== undefined ||
    storageOpen ||
    commandPaletteOpen ||
    keyboardHelpOpen;

  useEffect(() => {
    if (selectedTaskId && day && !day.allTasks.some((t) => t.id === selectedTaskId)) {
      setSelectedTaskId(null);
    }
  }, [day, selectedTaskId]);

  useEffect(() => {
    if (view === 'focus' && day) {
      if (!focusTaskId || !day.allTasks.some((t) => t.id === focusTaskId)) {
        const activeOrPausedFocus =
          day.focus?.taskId && day.allTasks.some((t) => t.id === day.focus?.taskId)
            ? day.focus.taskId
            : null;
        const nextIncomplete = day.allTasks.find((t) => !t.completed && t.plannedDate === day.today);
        setFocusTaskId(activeOrPausedFocus ?? nextIncomplete?.id ?? null);
      }
    }
  }, [view, day, focusTaskId]);

  function enterFocusView(explicitTaskId?: string, origin?: TaskOrigin) {
    if (view !== 'focus') {
      previousViewRef.current = view;
      if (!origin) captureTaskOrigin(explicitTaskId ?? selectedTaskIdRef.current);
      focusExitOriginRef.current = origin ?? snapshotTaskOrigin();
    }

    const currentSelectedId = explicitTaskId ?? selectedTaskIdRef.current ?? selectedTaskId;

    let chosenId: string | null = null;
    if (explicitTaskId) {
      chosenId = explicitTaskId;
    } else if (day?.focus?.taskId) {
      chosenId = day.focus.taskId;
    } else if (currentSelectedId && day?.allTasks.some((t) => t.id === currentSelectedId)) {
      chosenId = currentSelectedId;
    } else if (day) {
      const todayIncomplete = day.allTasks.find((t) => !t.completed && t.plannedDate === day.today);
      chosenId = todayIncomplete ? todayIncomplete.id : null;
    }
    setFocusTaskId(chosenId);
    setView('focus');
  }

  function exitFocusView() {
    pendingFocusRestore.current = true;
    setView(previousViewRef.current);
  }

  useEffect(() => {
    if (view !== 'focus' && pendingFocusRestore.current) {
      pendingFocusRestore.current = false;
      const origin = focusExitOriginRef.current;
      restoreOriginatingFocus(origin?.taskId, origin ?? undefined);
    }
  }, [view]);

  const pendingPaletteRestore = useRef(false);
  const pendingPaletteAction = useRef<(() => void) | null>(null);

  function openCommandPalette(triggerEl?: HTMLElement) {
    pendingPaletteAction.current = null;
    const trigger =
      triggerEl ??
      (document.activeElement instanceof HTMLElement && document.activeElement !== document.body
        ? document.activeElement
        : undefined);
    const cardEl = trigger?.closest<HTMLElement>('[data-task-id]');
    const taskIdFromEl = cardEl?.dataset.taskId;
    const finalTaskId = taskIdFromEl ?? selectedTaskIdRef.current ?? selectedTaskId;
    if (finalTaskId) {
      setSelectedTaskId(finalTaskId);
    }
    captureTaskOrigin(finalTaskId, trigger);
    setCommandPaletteOpen(true);
  }

  function closeCommandPalette() {
    pendingPaletteRestore.current = true;
    pendingPaletteAction.current = null;
    setCommandPaletteOpen(false);
  }

  function closeKeyboardHelp() {
    pendingHelpRestore.current = true;
    setKeyboardHelpOpen(false);
  }

  useEffect(() => {
    if (!commandPaletteOpen) {
      if (pendingPaletteRestore.current) {
        pendingPaletteRestore.current = false;
        restoreOriginatingFocus(originatingTaskId.current);
      } else if (pendingPaletteAction.current) {
        const action = pendingPaletteAction.current;
        pendingPaletteAction.current = null;
        requestAnimationFrame(() => {
          action();
        });
      }
    }
  }, [commandPaletteOpen]);

  useEffect(() => {
    if (!keyboardHelpOpen && pendingHelpRestore.current) {
      pendingHelpRestore.current = false;
      restoreOriginatingFocus();
    }
  }, [keyboardHelpOpen]);

  const selectedTask = selectedTaskId && day ? day.allTasks.find((t) => t.id === selectedTaskId) : null;

  const paletteCommands: CommandItem[] = [];

  if (selectedTask) {
    paletteCommands.push({
      id: 'task-edit',
      category: 'Task',
      title: `Edit task: "${selectedTask.title}"`,
      disabled: busy,
      disabledReason: busy ? 'Save in progress' : undefined,
      run: () => {
        const savedTrigger = originatingElement.current ?? undefined;
        const savedSurface = originatingSurface.current;
        setCommandPaletteOpen(false);
        setTimeout(() => {
          openEditor(selectedTask, savedTrigger, savedSurface);
        }, 0);
      },
    });

    if (day?.focus?.taskId === selectedTask.id && day.focus.running) {
      paletteCommands.push({
        id: 'task-pause-focus',
        category: 'Task',
        title: `Pause focus: "${selectedTask.title}"`,
        disabled: busy,
        disabledReason: busy ? 'Save in progress' : undefined,
        run: () => {
          setCommandPaletteOpen(false);
          void commit(() => window.planner.pauseFocus({ id: selectedTask.id, viewDate: day.date }));
        },
      });
    } else if (day?.focus?.taskId === selectedTask.id) {
      paletteCommands.push({
        id: 'task-resume-focus',
        category: 'Task',
        title: `Resume focus: "${selectedTask.title}"`,
        disabled: busy,
        disabledReason: busy ? 'Save in progress' : undefined,
        run: () => {
          setCommandPaletteOpen(false);
          void commit(() => window.planner.startFocus({ id: selectedTask.id, viewDate: day.date }));
        },
      });
    } else {
      const canFocus = selectedTask.plannedDate === day?.today && !selectedTask.completed;
      paletteCommands.push({
        id: 'task-start-focus',
        category: 'Task',
        title: `Start focus: "${selectedTask.title}"`,
        disabled: busy || !canFocus,
        disabledReason: busy
          ? 'Save in progress'
          : !canFocus
          ? selectedTask.completed
            ? 'Completed task cannot be focused'
            : 'Assign this task to today to focus'
          : undefined,
        run: () => {
          setCommandPaletteOpen(false);
          if (day) {
            void commit(() => window.planner.startFocus({ id: selectedTask.id, viewDate: day.date }));
          }
        },
      });
    }

    paletteCommands.push({
      id: 'task-complete-toggle',
      category: 'Task',
      title: selectedTask.completed ? `Reopen: "${selectedTask.title}"` : `Complete: "${selectedTask.title}"`,
      disabled: busy,
      disabledReason: busy ? 'Save in progress' : undefined,
      run: () => {
        setCommandPaletteOpen(false);
        if (day) {
          void commit(() =>
            window.planner.setTaskCompleted({
              id: selectedTask.id,
              completed: !selectedTask.completed,
              viewDate: day.date,
            })
          );
        }
      },
    });

    paletteCommands.push({
      id: 'task-focus-view',
      category: 'Task',
      title: `Focus on: "${selectedTask.title}"`,
      run: () => {
        const origin = snapshotTaskOrigin();
        setCommandPaletteOpen(false);
        enterFocusView(selectedTask.id, origin);
      },
    });
  }

  // Navigation commands
  paletteCommands.push(
    {
      id: 'nav-board',
      category: 'Navigation',
      title: 'Navigate to Board',
      run: () => {
        pendingPaletteAction.current = () => {
          const target = document.querySelector<HTMLElement>('.planning-board');
          target?.focus({ preventScroll: true });
        };
        setCommandPaletteOpen(false);
        setView('board');
      },
    },
    {
      id: 'nav-today',
      category: 'Navigation',
      title: 'Navigate to Today',
      run: () => {
        pendingPaletteAction.current = () => {
          const target = document.querySelector<HTMLElement>(
            '.view-day .task-add-bar:not([disabled])'
          );
          target?.focus({ preventScroll: true });
        };
        setCommandPaletteOpen(false);
        setView('day');
        goToDate();
      },
    },
    {
      id: 'nav-backlog',
      category: 'Navigation',
      title: 'Navigate to Backlog',
      run: () => {
        pendingPaletteAction.current = () => {
          const target = document.querySelector<HTMLElement>(
            '.view-backlog .task-add-bar:not([disabled])'
          );
          target?.focus({ preventScroll: true });
        };
        setCommandPaletteOpen(false);
        setView('backlog');
      },
    },
    {
      id: 'nav-focus',
      category: 'Navigation',
      title: 'Navigate to Focus',
      shortcut: 'F',
      run: () => {
        const origin = snapshotTaskOrigin();
        setCommandPaletteOpen(false);
        enterFocusView(undefined, origin);
      },
    }
  );

  // Actions
  paletteCommands.push(
    {
      id: 'action-add-task',
      category: 'Actions',
      title: 'Add task',
      shortcut: 'A',
      disabled: !day || busy || loading,
      disabledReason: busy ? 'Save in progress' : undefined,
      run: () => {
        setCommandPaletteOpen(false);
        setTimeout(() => openNew(), 0);
      },
    },
    {
      id: 'action-shortcuts',
      category: 'Actions',
      title: 'Show keyboard shortcuts',
      run: () => {
        setCommandPaletteOpen(false);
        setTimeout(() => setKeyboardHelpOpen(true), 0);
      },
    }
  );

  // Panels & Calendar
  paletteCommands.push(
    {
      id: 'panel-search',
      category: 'Panels',
      title: activeUtilityPanel === 'search' ? 'Close search panel' : 'Open search panel',
      shortcut: '/',
      run: () => {
        setCommandPaletteOpen(false);
        setActiveUtilityPanel((prev) => (prev === 'search' ? null : 'search'));
      },
    },
    {
      id: 'panel-backlog',
      category: 'Panels',
      title: activeUtilityPanel === 'backlog' ? 'Close backlog panel' : 'Open backlog panel',
      run: () => {
        setCommandPaletteOpen(false);
        setActiveUtilityPanel((prev) => (prev === 'backlog' ? null : 'backlog'));
      },
    },
    {
      id: 'panel-recovery',
      category: 'Panels',
      title: activeUtilityPanel === 'recovery' ? 'Close recovery panel' : 'Open recovery panel',
      run: () => {
        setCommandPaletteOpen(false);
        setActiveUtilityPanel((prev) => (prev === 'recovery' ? null : 'recovery'));
      },
    },
    {
      id: 'calendar-toggle',
      category: 'Panels',
      title: calendarOpen ? 'Hide calendar' : 'Show calendar',
      run: () => {
        setCommandPaletteOpen(false);
        setCalendarOpen(!calendarOpen);
      },
    }
  );

  // Settings
  paletteCommands.push({
    id: 'settings-storage',
    category: 'Settings',
    title: 'Open storage settings',
    run: () => {
      setCommandPaletteOpen(false);
      setTimeout(() => {
        setStorageTitle('Local storage');
        setStorageOpen(true);
      }, 0);
    },
  });

  useEffect(() => {
    const shortcuts = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.repeat) return;
      const target = event.target as HTMLElement | null;

      const isCmdK =
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        !event.shiftKey &&
        event.key.toLowerCase() === 'k';

      if (isCmdK) {
        if (commandPaletteOpen) {
          event.preventDefault();
          closeCommandPalette();
          return;
        }
        if (
          isAnyModalActive ||
          busy ||
          dragging !== null
        ) {
          return;
        }
        event.preventDefault();
        openCommandPalette(document.activeElement instanceof HTMLElement ? document.activeElement : undefined);
        return;
      }

      if (commandPaletteOpen || keyboardHelpOpen) return;

      if (event.key === 'Escape') {
        if (
          activeEditorMode !== null ||
          activeEstimatePopover !== null ||
          activeTaskMenu !== null ||
          filterOpen ||
          eventEditor !== null ||
          projectEditor !== undefined ||
          storageOpen
        ) {
          return;
        }
        if (view === 'focus') {
          event.preventDefault();
          exitFocusView();
          return;
        }
      }

      if (event.metaKey || event.ctrlKey || event.altKey) return;

      if (
        isAnyModalActive ||
        busy ||
        dragging !== null ||
        !day ||
        (target && (
          target.closest('input, textarea, select, [contenteditable="true"], dialog, [role="dialog"]') ||
          target.isContentEditable
        ))
      ) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key === 'a') {
        event.preventDefault();
        openNew();
      } else if (key === 'f') {
        event.preventDefault();
        enterFocusView();
      } else if (event.key === '/') {
        event.preventDefault();
        setActiveUtilityPanel('search');
        setTimeout(() => {
          const input = document.querySelector<HTMLElement>(
            '[data-testid="search-panel"] input[aria-label="Search all tasks"], [data-testid="search-panel"] input'
          );
          input?.focus();
        }, 0);
      }
    };
    window.addEventListener('keydown', shortcuts);
    return () => window.removeEventListener('keydown', shortcuts);
  }, [
    busy,
    day,
    view,
    boardCalendarDate,
    selectedProjectId,
    selectedTaskId,
    isAnyModalActive,
    commandPaletteOpen,
    keyboardHelpOpen,
    activeEditorMode,
    activeEstimatePopover,
    activeTaskMenu,
    filterOpen,
    eventEditor,
    projectEditor,
    storageOpen,
    dragging,
  ]);

  function taskCard(task: PlannerTask, _index: number, board = false) {
    if (!day) return null;
    const taskPlan = day.board.find((column) => column.date === task.plannedDate)?.plan;
    const summary = taskPlan?.tasks.find((row) => row.taskId === task.id);
    const taskBlocks = taskPlan?.scheduledBlocks.filter((block) => block.taskId === task.id) ?? [];
    const project = day.projects.find((project) => project.id === task.projectId);
    const repeat = day.recurrences.find((row) => row.id === task.recurrenceId);
    const focusing = day.focus?.running && day.focus.taskId === task.id;
    const canFocus = task.plannedDate !== null && (task.plannedDate === day.today || day.focus?.taskId === task.id);
    const actual = `${Math.floor(task.actualMinutes / 60)}:${String(Math.floor(task.actualMinutes) % 60).padStart(2, '0')}`;
    const estimate = `${Math.floor(task.plannedMinutes / 60)}:${String(task.plannedMinutes % 60).padStart(2, '0')}`;
    const pendingOnDate = day.allTasks.filter((row) => row.plannedDate === task.plannedDate && !row.completed);
    const priorityIndex = pendingOnDate.findIndex((row) => row.id === task.id);

    return (
      <article
        className={`task-card ${board ? 'board-task' : ''} ${task.completed ? 'completed-task' : ''} ${
          dragging === task.id ? 'is-dragging' : ''
        } ${focusing ? 'is-focusing' : ''} ${selectedTaskId === task.id ? 'is-selected' : ''}`}
        key={task.id}
        data-testid={board ? 'board-task' : 'task-card'}
        data-task-id={task.id}
        data-completed={task.completed}
        aria-selected={selectedTaskId === task.id}
        draggable={board && !busy}
        onClick={(event) => {
          const target = event.target as HTMLElement;
          if (!target.closest('button, input, textarea, select, [role="button"], [role="checkbox"]')) {
            setSelectedTaskId(task.id);
          }
        }}
        onFocus={() => {
          setSelectedTaskId(task.id);
        }}
        onDragOver={(event) => {
          if (!busy && (board || (!task.completed && view === 'day')) && event.dataTransfer.types.includes('text/plain')) {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
          }
        }}
        onDrop={(event) => {
          if (!board) {
            event.preventDefault();
            const sourceId = event.dataTransfer.getData('text/plain');
            if (sourceId && !task.completed && !busy) void reorder(sourceId, task.id);
            setDragging(null);
          }
        }}
      >
        <div className="card-topline">
          <span className="task-time">
            {task.completed
              ? 'Completed'
              : view === 'project' || view === 'backlog'
              ? task.plannedDate
                ? dateLabel(task.plannedDate, { month: 'short', day: 'numeric' })
                : 'Unscheduled'
              : taskBlocks[0]
              ? `${formatTime(taskBlocks[0].startMinute)}${taskBlocks.length > 1 ? ` · ${taskBlocks.length} blocks` : ''}`
              : task.plannedDate
              ? 'Not scheduled'
              : ''}
          </span>
          <button
            className="duration-badge"
            aria-label={`Edit duration for ${task.title}`}
            title={`${formatDuration(task.plannedMinutes)} planned · ${formatElapsed(task.actualMinutes * 60000)} actual`}
            onClick={(e) => {
              e.stopPropagation();
              captureTaskOrigin(task.id, e.currentTarget);
              setActiveEstimatePopover({ task, anchor: e.currentTarget });
            }}
            disabled={busy}
          >
            {task.actualMinutes > 0 && <span data-testid="task-actual">{actual} / </span>}
            {estimate}
            {summary && summary.unscheduledMinutes > 0 && <i className="duration-warning" />}
          </button>
        </div>
        <div className="task-main-row">
          <button
            className="task-title"
            onClick={(e) => {
              openEditor(task, e.currentTarget);
            }}
            disabled={busy}
          >
            {task.title}
          </button>
          {(board || (!task.completed && view === 'day')) && (
            <button
              className="drag-handle icon-button"
              draggable={!busy}
              aria-label={`Drag ${task.title} ${board ? 'between days' : 'to reorder'}`}
              title={board ? 'Drag to another day' : 'Drag to reorder'}
              onDragStart={(event) => {
                event.dataTransfer.setData('text/plain', task.id);
                event.dataTransfer.effectAllowed = 'move';
                setDragging(task.id);
              }}
              onDragEnd={() => setDragging(null)}
            >
              <Icon name="grip" size={16} />
            </button>
          )}
        </div>
        {task.notes && <p className="task-notes">{task.notes}</p>}
        <div className="card-footer">
          <input
            className="task-checkbox"
            type="checkbox"
            checked={task.completed}
            aria-label={`${task.completed ? 'Reopen' : 'Complete'} ${task.title}`}
            disabled={busy}
            onChange={() => {
              void commit(() =>
                window.planner.setTaskCompleted({ id: task.id, completed: !task.completed, viewDate: day.date })
              );
            }}
          />
          {repeat && (
            <span
              className="repeat-badge"
              data-testid="recurrence-tag"
              title={
                repeat.stoppedOn
                  ? 'Repeats stopped'
                  : repeat.weekdays.length === 7
                  ? 'Repeats daily'
                  : repeat.weekdays.map((weekday) => WEEKDAYS[weekday]).join(', ')
              }
            >
              <Icon name="repeat" size={12} />
            </span>
          )}
          <div className="task-tools">
            {!task.completed && (
              <button
                className="icon-button"
                aria-label={`${focusing ? 'Pause' : 'Start'} focus ${task.title}`}
                title={canFocus ? 'Focus timer' : 'Assign this task to today to focus'}
                disabled={busy || !canFocus}
                onClick={() => {
                  void commit(() =>
                    focusing
                      ? window.planner.pauseFocus({ id: task.id, viewDate: day.date })
                      : window.planner.startFocus({ id: task.id, viewDate: day.date })
                  );
                }}
              >
                <Icon name={focusing ? 'pause' : 'play'} size={14} />
              </button>
            )}
            {!task.completed && !board && view === 'day' && (
              <>
                <button
                  className="icon-button"
                  aria-label={`Move ${task.title} up`}
                  title="Move up"
                  disabled={busy || priorityIndex <= 0}
                  onClick={() => {
                    void reorder(task.id, pendingOnDate[priorityIndex - 1]!.id);
                  }}
                >
                  <Icon name="up" size={14} />
                </button>
                <button
                  className="icon-button"
                  aria-label={`Move ${task.title} down`}
                  title="Move down"
                  disabled={busy || priorityIndex === pendingOnDate.length - 1}
                  onClick={() => {
                    void reorder(task.id, pendingOnDate[priorityIndex + 1]!.id);
                  }}
                >
                  <Icon name="down" size={14} />
                </button>
              </>
            )}
            <button
              className="icon-button delete-button"
              aria-label={`Delete ${task.title}`}
              title="Delete task"
              disabled={busy}
              onClick={() => {
                void remove(task);
              }}
            >
              <Icon name="trash" size={14} />
            </button>
            <button
              className="icon-button task-menu-trigger"
              aria-label={`More actions for ${task.title}`}
              aria-haspopup="menu"
              disabled={busy}
              onClick={(e) => {
                e.stopPropagation();
                captureTaskOrigin(task.id, e.currentTarget);
                setActiveTaskMenu({ task, anchor: e.currentTarget });
              }}
            >
              <Icon name="dots" size={14} />
            </button>
          </div>
          {project && (
            <span className="project-tag" title={project.title}>
              <i style={{ color: project.color }}>#</i>
              {project.title}
            </span>
          )}
        </div>
        {task.deadline && (
          <div className={`deadline-tag ${task.deadline < day.today && !task.completed ? 'overdue' : ''}`}>
            {task.deadline < day.today && !task.completed ? 'Overdue · ' : 'Due '}
            {dateLabel(task.deadline, { month: 'short', day: 'numeric' })}
          </div>
        )}
        {summary && summary.unscheduledMinutes > 0 && (
          <div className="task-overflow">
            <span />
            {formatDuration(summary.unscheduledMinutes)} won’t fit{board ? '' : ' in this day'}
          </div>
        )}
      </article>
    );
  }

  const isModalOpen =
    activeEditorMode !== null ||
    commandPaletteOpen ||
    keyboardHelpOpen ||
    storageOpen ||
    eventEditor !== null ||
    projectEditor !== undefined;

  return (
    <>
      <div className={`planner-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`} inert={isModalOpen ? true : undefined}>
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="brand-symbol">
            <Icon name="calendar" size={19} />
          </span>
          <strong>Laptop Planner</strong>
        </div>
        <nav aria-label="Main navigation">
          <button
            className={`nav-item ${view === 'board' ? 'active': ''}`}
            aria-label="Multi-day board"
            title="Home · Board"
            onClick={() => setView('board')}
            disabled={busy}
          >
            <Icon name="home" />
            <span>Home</span>
          </button>
          <button
            className={`nav-item ${view === 'day' ? 'active' : ''}`}
            aria-label="Daily planner"
            title="Today"
            onClick={() => {
              setView('day');
              goToDate();
            }}
            disabled={busy || loading}
          >
            <Icon name="today" />
            <span>Today</span>
          </button>
          <button
            className={`nav-item ${view === 'focus' ? 'active' : ''}`}
            aria-label="Focus view"
            title="Focus · F"
            onClick={(event) => enterFocusView(undefined, { element: event.currentTarget, taskId: selectedTaskIdRef.current, surface: 'board' })}
            disabled={busy}
          >
            <Icon name="focus" />
            <span>Focus</span>
          </button>
        </nav>
        <div className="sidebar-section-label">YOUR PLANNING</div>
        <button
          className={`nav-item ${view === 'backlog' ? 'active' : ''}`}
          aria-label="Backlog"
          title="Backlog"
          data-backlog-drop="true"
          onDragOver={(event) => {
            if (event.dataTransfer.types.includes('text/plain')) {
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
            }
          }}
          onDrop={(event) => {
            event.preventDefault();
            const id = event.dataTransfer.getData('text/plain');
            if (id && !busy) void moveTask(id, null);
          }}
          onClick={() => setView('backlog')}
          disabled={busy}
        >
          <Icon name="archive" />
          <span>Backlog</span>
        </button>
        <div className="projects-heading">
          <span>PROJECTS</span>
          <button
            className="icon-button"
            aria-label="New project"
            title="New project"
            onClick={() => setProjectEditor(null)}
            disabled={!day || busy}
          >
            <Icon name="plus" size={16} />
          </button>
        </div>
        <div className="sidebar-projects">
          {day?.projects.map((project) => (
            <button
              key={project.id}
              className={`nav-item ${view === 'project' && selectedProjectId === project.id ? 'active' : ''}`}
              aria-label={`Open project ${project.title}`}
              title={project.title}
              onClick={() => {
                setSelectedProjectId(project.id);
                setView('project');
              }}
              disabled={busy}
            >
              <span className="project-hash" style={{ color: project.color }}>
                #
              </span>
              <span>{project.title}</span>
            </button>
          ))}
          {!day?.projects.length && (
            <button
              className="add-project-row"
              aria-label="Create your first project"
              onClick={() => setProjectEditor(null)}
              disabled={!day || busy}
            >
              <Icon name="plus" size={15} />
              <span>Add project</span>
            </button>
          )}
        </div>
        <div className="sidebar-bottom">
          <button
            className="nav-item"
            aria-label="Settings"
            title="Settings"
            disabled={busy}
            onClick={() => {
              setStorageTitle('Settings');
              setStorageOpen(true);
            }}
          >
            <Icon name="settings" size={18} />
            <span>Settings</span>
          </button>
          <button
            className="nav-item"
            aria-label="Local storage"
            title="Local storage"
            onClick={() => {
              setStorageTitle('Local storage');
              setStorageOpen(true);
            }}
          >
            <Icon name="storage" size={18} />
            <span>Local storage</span>
          </button>
          <div className="sidebar-footer">
            <span className="local-indicator">
              <span className="status-dot" />
              Only on this Mac
            </span>
            <button
              className="icon-button"
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title="Toggle sidebar"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            >
              <Icon name="sidebar" size={17} />
            </button>
          </div>
        </div>
      </aside>

      {(() => {
        const isDockOpen = Boolean(activeUtilityPanel || (calendarOpen && day));
        const currentFocusTask =
          focusTaskId && day ? day.allTasks.find((t) => t.id === focusTaskId) ?? null : null;
        const todayIncompleteTasks = day
          ? day.allTasks.filter((t) => t.plannedDate === day.today && !t.completed)
          : [];
        const eligibleFocusTasks =
          currentFocusTask && !todayIncompleteTasks.some((t) => t.id === currentFocusTask.id)
            ? [currentFocusTask, ...todayIncompleteTasks]
            : todayIncompleteTasks;

        return (
          <div
            className={`workspace ${isDockOpen ? 'has-calendar' : 'calendar-hidden'} ${
              view === 'focus' ? 'focus-view' : ''
            }`}
            style={{ '--calendar-width': calendarWidth === null ? undefined : `${calendarWidth}px` } as CSSProperties}
          >
            <header className="workspace-topbar">
              <div className="toolbar-left">
                <button className="toolbar-button" aria-label="Go to today" disabled={!day || busy} onClick={() => goToDate()}>
                  <Icon name="calendar" size={16} />
                  {displayDay?.date === day?.today
                    ? 'Today'
                    : displayDay?.date === shiftDate(day?.today ?? '2026-01-01', 1)
                    ? 'Tomorrow'
                    : displayDay
                    ? dateLabel(displayDay.date, { month: 'short', day: 'numeric' })
                    : 'Today'}
                </button>
                {day && (
                  <div className="date-navigation">
                    <button
                      className="icon-button"
                      aria-label="Previous day"
                      disabled={busy || loading || day.date <= (view === 'board' ? '0001-01-07' : '0001-01-01')}
                      onClick={() => goToDate(shiftDate(day.date, view === 'board' ? -7 : -1))}
                    >
                      <Icon name="left" size={17} />
                    </button>
                    <label className="date-picker" title="Go to date">
                      <input
                        aria-label="Go to date"
                        type="date"
                        min="0001-01-01"
                        max="9999-12-31"
                        value={displayDay?.date ?? day.date}
                        disabled={busy || loading}
                        onChange={(event) => {
                          if (event.target.value) goToDate(event.target.value);
                        }}
                      />
                    </label>
                    <button
                      className="icon-button"
                      aria-label="Next day"
                      disabled={busy || loading || day.date >= (view === 'board' ? '9999-12-25' : '9999-12-31')}
                      onClick={() => goToDate(shiftDate(day.date, view === 'board' ? 7 : 1))}
                    >
                      <Icon name="right" size={17} />
                    </button>
                  </div>
                )}
                <button
                  className={`toolbar-button ${filterOpen ? 'selected' : ''} ${isFilterActive ? 'has-active-filter' : ''}`}
                  aria-label="Filter tasks"
                  aria-expanded={filterOpen}
                  onClick={(e) => {
                    setFilterAnchor(e.currentTarget);
                    setFilterOpen(!filterOpen);
                  }}
                >
                  <Icon name="filter" size={17} />
                  <span>Filter</span>
                  {isFilterActive && <i className="filter-dot" />}
                </button>
                {filterOpen && (
                  <FilterChooser
                    anchor={filterAnchor}
                    filterQuery={filterQuery}
                    onQueryChange={setFilterQuery}
                    filterStatus={filterStatus}
                    onStatusChange={setFilterStatus}
                    filterProjectId={filterProjectId}
                    onProjectChange={setFilterProjectId}
                    projects={day?.projects ?? []}
                    isFilterActive={isFilterActive}
                    onClear={clearFilters}
                    onDismiss={() => {
                      setFilterOpen(false);
                      setFilterAnchor(null);
                      filterAnchor?.focus({ preventScroll: true });
                    }}
                  />
                )}
              </div>
              <div className="toolbar-right">
                <span className={`save-status ${error ? 'has-error' : ''}`} role="status">
                  <span className={`status-dot ${error ? 'warning' : ''}`} />
                  {busy ? 'Saving…' : error ? 'Needs attention' : 'Saved locally'}
                </span>
                <div className="view-switch" aria-label="Planner view">
                  <button
                    aria-label="Board view"
                    aria-pressed={view === 'board'}
                    title="Board view"
                    onClick={() => setView('board')}
                    disabled={busy}
                  >
                    <Icon name="board" size={15} />
                    <span>Board</span>
                  </button>
                  <button
                    aria-label="Today view"
                    aria-pressed={view === 'day'}
                    title="Today view"
                    onClick={() => {
                      setView('day');
                      if (boardCalendarDate) goToDate(boardCalendarDate);
                    }}
                    disabled={busy}
                  >
                    <Icon name="today" size={15} />
                    <span>Day</span>
                  </button>
                </div>
                <button
                  className="toolbar-button toolbar-palette-trigger"
                  aria-label="Open command palette"
                  title="Command palette · ⌘K"
                  onClick={(e) => openCommandPalette(e.currentTarget)}
                  disabled={!day || busy}
                >
                  <Icon name="search" size={15} />
                  <span>Commands</span>
                  <kbd className="shortcut-kbd">⌘K</kbd>
                </button>
                <button
                  className="button primary toolbar-add"
                  aria-label="Add task"
                  title="Add task · A"
                  onClick={(e) => openNew(undefined, e.currentTarget)}
                  disabled={!day || busy || loading}
                >
                  <Icon name="plus" size={17} />
                  <span>Add task</span>
                </button>
              </div>
            </header>

            <div className="workspace-context">
              {displayDay && (view === 'day' || view === 'board') && <DailyWorkload day={displayDay} />}
            </div>

        {day && view !== 'focus' && (
          <FocusBar
            day={day}
            busy={busy}
            onStart={(id) => {
              void commit(() => window.planner.startFocus({ id, viewDate: day.date }));
            }}
            onPause={(id) => {
              void commit(() => window.planner.pauseFocus({ id, viewDate: day.date }));
            }}
            onComplete={(id) => {
              void commit(() => window.planner.setTaskCompleted({ id, completed: true, viewDate: day.date }));
            }}
          />
        )}

        <div className="workspace-body">
          {view === 'focus' && day && (
            <FocusScreen
              day={day}
              task={currentFocusTask}
              busy={busy}
              error={error}
              eligibleTasks={eligibleFocusTasks}
              onSelectTask={(id) => setFocusTaskId(id)}
              onStart={(id) => {
                void commit(() => window.planner.startFocus({ id, viewDate: day.date }));
              }}
              onPause={(id) => {
                void commit(() => window.planner.pauseFocus({ id, viewDate: day.date }));
              }}
              onComplete={async (id, completed) => {
                const res = await commit(() =>
                  window.planner.setTaskCompleted({ id, completed, viewDate: day.date })
                );
                if (!res && completed) {
                  const remaining = day.allTasks.filter(
                    (t) => !t.completed && t.plannedDate === day.today && t.id !== id
                  );
                  if (remaining.length > 0 && remaining[0]) {
                    setFocusTaskId(remaining[0].id);
                  } else {
                    setFocusTaskId(null);
                  }
                }
              }}
              onEdit={(task, el) => {
                openEditor(task, el, 'focus');
              }}
              onExit={exitFocusView}
              onAddTask={() => openNew(day.today)}
            />
          )}
          <main
            className={`planner-main view-${workspaceView}`}
            style={view === 'focus' ? { display: 'none' } : undefined}
            inert={view === 'focus' ? true : undefined}
            aria-hidden={view === 'focus' ? 'true' : undefined}
          >
            {error && (
              <div className="error-banner" role="alert">
                <div>
                  {!day && <h2>Storage needs attention</h2>}
                  <p>{error}</p>
                </div>
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => {
                    void refresh(followingToday.current ? undefined : dateRef.current);
                  }}
                >
                  Refresh day
                </button>
              </div>
            )}
            {!day && !error && <div className="loading-state">Opening your local planner…</div>}
            {day && (
              <>
                {workspaceView === 'board' ? (
                  <>
                    <h1 className="sr-only">Your week</h1>
                    <PlanningBoard
                      active={view !== 'focus'}
                      panelRef={boardPanelRef}
                      dnd={dnd}
                      day={day}
                      selectedDate={displayDay!.date}
                      busy={busy}
                      navigationKey={boardNavigationKey}
                      onMove={moveBoardTask}
                      onActiveDay={(date) => {
                        setBoardCalendarDate(date);
                        followingToday.current = date === day.today && day.date === day.today;
                      }}
                      onAdd={(date) => openNew(date)}
                      onOpenDay={(date) => {
                        setView('day');
                        goToDate(date);
                      }}
                      renderTask={(task, index) => taskCard(task, index, true)}
                      matches={matches}
                    />
                  </>
                ) : (
                  <>
                    <section className="day-header">
                      <div className="day-title">
                        <h1 aria-label={heading}>{workspaceView === 'day' ? dateLabel(day.date, { weekday: 'long' }) : heading}</h1>
                        <span>
                          {workspaceView === 'backlog'
                            ? 'Work for another day'
                            : view === 'focus'
                            ? 'One task. Your full attention.'
                            : workspaceView === 'project'
                            ? 'Project tasks'
                            : dateLabel(day.date, { month: 'long', day: 'numeric', year: 'numeric' })}
                        </span>
                      </div>
                    </section>
                    {workspaceView === 'project' && selectedProject && (
                      <section className="project-overview">
                        <div>
                          <p>{selectedProject.notes || 'All the work that belongs here.'}</p>
                          {selectedProject.deadline && (
                            <span
                              className={`deadline-tag ${
                                selectedProject.deadline < day.today ? 'overdue' : ''
                              }`}
                            >
                              {selectedProject.deadline < day.today ? 'Overdue · ' : 'Deadline '}
                              {dateLabel(selectedProject.deadline, { month: 'long', day: 'numeric', year: 'numeric' })}
                            </span>
                          )}
                        </div>
                        <button className="button secondary" onClick={() => setProjectEditor(selectedProject)}>
                          Edit project
                        </button>
                      </section>
                    )}
                    {workspaceView === 'backlog' && (
                      <p className="view-intro">Keep future work here. Choose a day when you’re ready to schedule it.</p>
                    )}
                    <section className="task-panel" aria-label="Tasks">
                      <div className="task-panel-heading">
                        <h2 className="sr-only">
                          {workspaceView === 'project' ? 'Project tasks' : workspaceView === 'backlog' ? 'Future tasks' : 'Your tasks'}
                        </h2>
                        <span className="completion-count">
                          {visibleTasks.filter((task) => task.completed).length} of {visibleTasks.length} done
                        </span>
                      </div>
                      <div className="completion-track">
                        <div
                          style={{
                            width: `${
                              visibleTasks.length
                                ? (visibleTasks.filter((task) => task.completed).length / visibleTasks.length) * 100
                                : 0
                            }%`,
                          }}
                        />
                      </div>
                      <button
                        className="task-add-bar"
                        aria-label="Add task to selected view"
                        onClick={(e) => openNew(undefined, e.currentTarget)}
                        disabled={busy}
                      >
                        <Icon name="plus" size={19} />
                        <span>Add task</span>
                        <kbd>A</kbd>
                        <strong>
                          {formatDuration(
                            visibleTasks.filter((task) => !task.completed).reduce((sum, task) => sum + task.plannedMinutes, 0)
                          )}
                        </strong>
                      </button>
                      <div className="task-list" aria-busy={busy || loading}>
                        {incomplete.map((task, index) => taskCard(task, index))}
                        {!filteredTasks.length && (
                          <div className="empty-state">
                            <Icon name={isFilterActive ? 'search' : view === 'focus' ? 'focus' : 'note'} size={28} />
                            <h3>
                              {isFilterActive
                                ? 'No matching tasks'
                                : workspaceView === 'backlog'
                                ? 'A little room for later'
                                : 'What deserves your time?'}
                            </h3>
                            <p>
                              {isFilterActive
                                ? 'Try another word, or clear your filters.'
                                : workspaceView === 'backlog'
                                ? 'Capture an idea now. Give it a day later.'
                                : 'Add a task, give it an estimate, and make space for it.'}
                            </p>
                            {isFilterActive ? (
                              <button className="button secondary" onClick={clearFilters}>
                                Clear filter
                              </button>
                            ) : (
                              <button className="button secondary" onClick={(e) => openNew(undefined, e.currentTarget)}>
                                <Icon name="plus" size={14} />
                                Plan your first task
                              </button>
                            )}
                          </div>
                        )}
                        {completed.length > 0 && (
                          <div className="completed-section">
                            <div className="completed-heading">
                              <Icon name="check" size={13} />
                              Completed
                              <span>{completed.length}</span>
                            </div>
                            {completed.map((task, index) => taskCard(task, index))}
                          </div>
                        )}
                      </div>
                    </section>
                  </>
                )}
              </>
            )}
          </main>
          {isDockOpen && (
            <CalendarDock width={calendarWidth} onResize={setCalendarWidth} inert={view === 'focus'}>
              {activeUtilityPanel === 'backlog' ? (
                <BacklogPanel
                  day={day}
                  busy={busy}
                  dndHandlers={dnd.handlers}
                  onOpenTask={(task, el) => openEditor(task, el, 'backlog')}
                  onEstimate={(task, anchor) => {
                    captureTaskOrigin(task.id, anchor, 'backlog');
                    setActiveEstimatePopover({ task, anchor });
                  }}
                  onOpenMenu={(task, anchor) => {
                    captureTaskOrigin(task.id, anchor, 'backlog');
                    setActiveTaskMenu({ task, anchor });
                  }}
                  onToggleComplete={(task) => {
                    void commit(() =>
                      window.planner.setTaskCompleted({
                        id: task.id,
                        completed: !task.completed,
                        viewDate: day!.date,
                      })
                    );
                  }}
                  onAdd={() => openNew(null)}
                  onClose={() => setActiveUtilityPanel(null)}
                  onMoveToBacklog={(id) => void moveTask(id, null)}
                  selectedTaskId={selectedTaskId}
                  onSelectTask={(id) => setSelectedTaskId(id)}
                />
              ) : activeUtilityPanel === 'search' ? (
                <SearchPanel
                  day={day}
                  query={searchQuery}
                  activeTaskId={activeSearchResultId}
                  onQueryChange={setSearchQuery}
                  onOpenTask={(task, el) => openEditor(task, el, 'search')}
                  onToggleComplete={(task) => {
                    void commit(() =>
                      window.planner.setTaskCompleted({
                        id: task.id,
                        completed: !task.completed,
                        viewDate: day!.date,
                      })
                    );
                  }}
                  onClose={() => setActiveUtilityPanel(null)}
                  busy={busy}
                />
              ) : activeUtilityPanel === 'recovery' ? (
                <RecoveryPanel
                  day={day}
                  error={error}
                  busy={busy}
                  onRefresh={() => void refresh(followingToday.current ? undefined : dateRef.current)}
                  onResumeFocus={(taskId) => {
                    if (day) void commit(() => window.planner.startFocus({ id: taskId, viewDate: day.date }));
                  }}
                  onOpenTask={(task, el) => openEditor(task, el, 'recovery')}
                  onOpenStorage={() => {
                    setStorageTitle('Local storage');
                    setStorageOpen(true);
                  }}
                  onClose={() => setActiveUtilityPanel(null)}
                />
              ) : calendarOpen && displayDay ? (
                <DayCalendar
                  day={displayDay}
                  busy={busy}
                  onEdit={(task) => {
                    if (!busy) openEditor(task);
                  }}
                  onAddEvent={addEvent}
                  onEditEvent={(event) => setEventEditor({ event, minute: event.start.minute })}
                  onChangeEvent={changeEvent}
                />
              ) : null}
            </CalendarDock>
          )}
          <aside className="utility-rail" aria-label="Quick panels">
            <button
              className={`rail-button ${calendarOpen && activeUtilityPanel === null ? 'active' : ''}`}
              aria-label={calendarOpen && activeUtilityPanel === null ? 'Hide calendar' : 'Show calendar'}
              title="Calendar"
              onClick={() => {
                if (activeUtilityPanel !== null) {
                  setActiveUtilityPanel(null);
                  setCalendarOpen(true);
                } else {
                  setCalendarOpen(!calendarOpen);
                }
              }}
            >
              <Icon name="calendar" size={20} />
            </button>
            <button
              className={`rail-button ${activeUtilityPanel === 'backlog' ? 'active' : ''}`}
              aria-label="Open backlog panel"
              title="Backlog panel"
              data-backlog-drop="true"
              onDragOver={(event) => {
                if (event.dataTransfer.types.includes('text/plain')) {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'move';
                }
              }}
              onDrop={(event) => {
                event.preventDefault();
                const id = event.dataTransfer.getData('text/plain');
                if (id && !busy) void moveTask(id, null);
              }}
              onClick={() => {
                setActiveUtilityPanel((prev) => (prev === 'backlog' ? null : 'backlog'));
              }}
            >
              <Icon name="archive" size={20} />
            </button>
            <button
              className={`rail-button ${activeUtilityPanel === 'search' ? 'active' : ''}`}
              aria-label="Open search panel"
              title="Search panel"
              onClick={() => {
                setActiveUtilityPanel((prev) => (prev === 'search' ? null : 'search'));
              }}
            >
              <Icon name="search" size={20} />
            </button>
            <button
              className={`rail-button ${activeUtilityPanel === 'recovery' ? 'active' : ''}`}
              aria-label="Open recovery panel"
              title="Recovery panel"
              onClick={() => {
                setActiveUtilityPanel((prev) => (prev === 'recovery' ? null : 'recovery'));
              }}
            >
              <Icon name="storage" size={20} />
            </button>
            <div className="rail-divider" />
            <button
              className={`rail-button ${view === 'focus' ? 'active' : ''}`}
              aria-label="Open focus view"
              title="Focus · F"
              onClick={(event) => enterFocusView(undefined, { element: event.currentTarget, taskId: selectedTaskIdRef.current, surface: 'board' })}
            >
              <Icon name="focus" size={20} />
            </button>
            <button
              className="rail-button"
              aria-label="Create fixed event"
              title="Add fixed event"
              onClick={() => addEvent()}
              disabled={!day || busy}
            >
              <Icon name="plus" size={22} />
            </button>
          </aside>
        </div>
      </div>
    );
  })()}
</div>

      {(() => {
        const creationDraft = activeCreation ? creationDrafts[activeCreation.key] : undefined;
        const existingDraft = activeTask ? existingDrafts[activeTask.id] : undefined;
        return (
          <>
            {activeEditorMode === 'quick' && activeCreation && day && creationDraft && (
              <QuickAddComposer
                draft={creationDraft}
                projects={day.projects}
                busy={busy}
                onDraftChange={(updated) => updateCreationDraft(activeCreation.key, updated)}
                onOpenFullDetails={() => setActiveEditorMode('details')}
                onDiscard={discardActiveDraft}
                onDismiss={dismissActiveSurface}
                onSubmit={async () => {
                  await submitCreationDraft();
                }}
              />
            )}

            {activeEditorMode === 'details' && activeCreation && day && creationDraft && (
              <TaskEditor
                task={null}
                draft={creationDraft}
                projects={day.projects}
                template={undefined}
                busy={busy}
                isDirty={isDraftDirty(
                  creationDraft,
                  initialCreationDrafts.current[activeCreation.key] ?? creationDraft
                )}
                onDraftChange={(updated) => updateCreationDraft(activeCreation.key, updated)}
                onDismiss={dismissActiveSurface}
                onDiscard={discardActiveDraft}
                onSave={async () => {
                  await submitCreationDraft();
                }}
              />
            )}

            {activeEditorMode === 'details' && activeTask && day && existingDraft && (
              <TaskEditor
                task={activeTask}
                draft={existingDraft}
                projects={day.projects}
                template={day.recurrences.find((row) => row.id === activeTask.recurrenceId)}
                busy={busy}
                isDirty={isDraftDirty(
                  existingDraft,
                  initialExistingDrafts.current[activeTask.id] ?? existingDraft
                )}
                onDraftChange={(updated) => updateExistingDraft(activeTask.id, updated)}
                onDismiss={dismissActiveSurface}
                onDiscard={discardActiveDraft}
                onSave={async () => {
                  await submitExistingTaskDraft();
                }}
              />
            )}
          </>
        );
      })()}

      {activeEstimatePopover && (
        <EstimatePopover
          anchor={activeEstimatePopover.anchor}
          initialValue={
            activeEstimatePopover.attemptedValue ??
            formatDuration(activeEstimatePopover.task.plannedMinutes)
          }
          busy={busy}
          error={activeEstimatePopover.error}
          onSelect={async (minutes, formatted) => {
            await saveStandaloneEstimate(minutes, formatted);
          }}
          onDismiss={() => {
            if (busy) return;
            setActiveEstimatePopover(null);
            restoreOriginatingFocus(originatingTaskId.current);
          }}
        />
      )}

      {activeTaskMenu && (
        <TaskMenu
          task={activeTaskMenu.task}
          anchor={activeTaskMenu.anchor}
          busy={busy}
          onEdit={(task) => {
            setActiveTaskMenu(null);
            openEditor(task, activeTaskMenu.anchor);
          }}
          onMoveToBacklog={(task) => {
            setActiveTaskMenu(null);
            void moveTask(task.id, null);
          }}
          onDelete={(task) => {
            setActiveTaskMenu(null);
            void remove(task);
          }}
          onDismiss={() => {
            setActiveTaskMenu(null);
            restoreOriginatingFocus(originatingTaskId.current);
          }}
        />
      )}

      {projectEditor !== undefined && day && (
        <ProjectEditor
          project={projectEditor}
          date={day.date}
          onDismiss={() => setProjectEditor(undefined)}
          onSave={saveProject}
        />
      )}

      {eventEditor && day && (
        <EventEditor
          event={eventEditor.event}
          date={displayDay?.date ?? day.date}
          initialMinute={eventEditor.minute}
          onDismiss={() => setEventEditor(null)}
          onSave={saveEvent}
          onDelete={async (id) => {
            const message = await commit(() => window.planner.deleteEvent({ id, viewDate: day.date }));
            if (!message) setEventEditor(null);
            return message;
          }}
        />
      )}

      {storageOpen && (
        <StorageDialog
          title={storageTitle}
          viewDate={day?.date ?? '2026-01-01'}
          onSaveSettings={saveSettings}
          onRestored={afterRestore}
          onDismiss={() => setStorageOpen(false)}
        />
      )}

      {deleted && (
        <div className="undo-toast" role="status" inert={isModalOpen ? true : undefined}>
          <Icon name="trash" size={15} />
          <span>Deleted “{deleted.title}”</span>
          <button
            disabled={busy}
            onClick={() => {
              if (day)
                void commit(() => window.planner.restoreTask({ id: deleted.id, viewDate: day.date })).then(
                  (message) => {
                    if (!message) setDeleted(null);
                  }
                );
            }}
          >
            Undo
          </button>
          <button className="icon-button" aria-label="Dismiss notification" onClick={() => setDeleted(null)}>
            <Icon name="close" size={14} />
          </button>
        </div>
      )}

      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={closeCommandPalette}
        commands={paletteCommands}
      />

      <KeyboardHelpDialog
        isOpen={keyboardHelpOpen}
        onClose={closeKeyboardHelp}
      />
    </>
  );
}
