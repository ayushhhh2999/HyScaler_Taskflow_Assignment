import { CalendarDays, Check, Circle, Clock3, MoreHorizontal, UserRound } from "lucide-react";
import type { Task, TaskPriority, TaskStatus } from "@/lib/types";

export function StatusPill({ status }: { status: TaskStatus }) {
  const labels: Record<TaskStatus, string> = { todo: "To do", in_progress: "In progress", done: "Done" };
  return (
    <span className={`status-pill status-${status}`}>
      <span className="status-dot" />
      {labels[status]}
    </span>
  );
}

export function PriorityPill({ priority }: { priority: TaskPriority }) {
  return <span className={`priority-pill priority-${priority}`}>{priority}</span>;
}

function assigneeLabel(task: Task) {
  return task.assignee_name || task.assignee_email || null;
}

export function TaskRow({
  task,
  onClick,
  onStatusChange,
}: {
  task: Task;
  onClick: () => void;
  onStatusChange: (status: TaskStatus) => void;
}) {
  const isDone = task.status === "done";
  const assignee = assigneeLabel(task);
  return (
    <div
      className={`task-row ${isDone ? "is-done" : ""}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => event.key === "Enter" && onClick()}
    >
      <button
        className={`task-check ${isDone ? "checked" : ""}`}
        aria-label={isDone ? "Mark task to do" : "Mark task done"}
        onClick={(event) => {
          event.stopPropagation();
          onStatusChange(isDone ? "todo" : "done");
        }}
      >
        {isDone && <Check size={13} strokeWidth={3} />}
      </button>
      <div className="task-row-main">
        <div className="task-row-heading">
          <strong>{task.title}</strong>
          <PriorityPill priority={task.priority} />
        </div>
        <div className="task-row-meta">
          <span>
            <CalendarDays size={13} />
            {task.due_date ? formatDueDate(task.due_date) : "No due date"}
          </span>
          {assignee && (
            <span>
              <UserRound size={13} />
              {assignee}
            </span>
          )}
        </div>
      </div>
      <div className="task-row-end">
        <StatusPill status={task.status} />
        <button className="icon-button ghost-button" aria-label="More task actions" onClick={(event) => event.stopPropagation()}>
          <MoreHorizontal size={17} />
        </button>
      </div>
    </div>
  );
}

export function KanbanCard({
  task,
  dragging,
  onClick,
  onDragStart,
  onDragEnd,
}: {
  task: Task;
  dragging?: boolean;
  onClick: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const assignee = assigneeLabel(task);
  return (
    <article
      className={`kanban-card ${dragging ? "is-dragging" : ""} ${task.status === "done" ? "is-done" : ""}`}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData("text/task-id", task.id);
        event.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => event.key === "Enter" && onClick()}
    >
      <div className="kanban-card-top">
        <PriorityPill priority={task.priority} />
        <StatusPill status={task.status} />
      </div>
      <strong>{task.title}</strong>
      {task.description && <p>{task.description}</p>}
      <div className="kanban-card-meta">
        <span>
          <CalendarDays size={12} />
          {task.due_date ? formatDueDate(task.due_date) : "No due date"}
        </span>
        <span>
          <UserRound size={12} />
          {assignee || "Unassigned"}
        </span>
      </div>
    </article>
  );
}

export function TaskSkeleton() {
  return (
    <div className="task-row skeleton-row">
      <span className="skeleton skeleton-circle" />
      <div className="skeleton-block">
        <span className="skeleton skeleton-line wide" />
        <span className="skeleton skeleton-line narrow" />
      </div>
      <span className="skeleton skeleton-pill" />
    </div>
  );
}

export function formatDueDate(date: string) {
  const value = new Date(date);
  if (Number.isNaN(value.getTime())) return "No due date";
  const today = new Date();
  const sameDay = value.toDateString() === today.toDateString();
  if (sameDay) return "Today";
  return value.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function formatRelativeTime(date: string) {
  const value = new Date(date).getTime();
  const diff = Math.max(0, Date.now() - value);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function EmptyTaskState({
  title = "No tasks yet",
  description = "Create a task to start building momentum.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="empty-state">
      <span className="empty-state-icon">
        <Circle size={19} />
      </span>
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}

export function StatCard({
  label,
  value,
  helper,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string | number;
  helper: string;
  icon: typeof Clock3;
  accent: string;
}) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${accent}`}>
        <Icon size={18} />
      </div>
      <div className="stat-copy">
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{helper}</small>
      </div>
    </div>
  );
}
