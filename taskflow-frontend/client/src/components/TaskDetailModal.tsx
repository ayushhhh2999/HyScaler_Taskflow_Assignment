import { FormEvent, useEffect, useState } from "react";
import { CalendarDays, Check, MessageCircle, Pencil, Send, Trash2, X } from "lucide-react";
import { api } from "@/lib/api";
import type { Comment, Task, TaskPriority, TaskStatus, User } from "@/lib/types";
import { formatRelativeTime, PriorityPill, StatusPill } from "@/components/TaskComponents";
import { useProjectSocket, type ProjectSocketEvent } from "@/hooks/useProjectSocket";

function authorLabel(comment: Comment) {
  return comment.author_name || comment.author_email || `${comment.author_id.slice(0, 8)}…`;
}

function authorInitials(comment: Comment) {
  const label = comment.author_name || comment.author_email || comment.author_id;
  return label.slice(0, 2).toUpperCase();
}

export function TaskDetailModal({
  task,
  assigneeOptions = [],
  onClose,
  onUpdated,
  onDeleted,
}: {
  task: Task;
  assigneeOptions?: User[];
  onClose: () => void;
  onUpdated: (task: Task) => void;
  onDeleted: (taskId: string) => void;
}) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [comment, setComment] = useState("");
  const [loadingComments, setLoadingComments] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState({
    title: task.title,
    description: task.description || "",
    priority: task.priority,
    status: task.status,
    due_date: task.due_date ? task.due_date.slice(0, 10) : "",
    assignee_id: task.assignee_id || "",
  });

  useEffect(() => {
    setDraft({
      title: task.title,
      description: task.description || "",
      priority: task.priority,
      status: task.status,
      due_date: task.due_date ? task.due_date.slice(0, 10) : "",
      assignee_id: task.assignee_id || "",
    });
  }, [task]);

  useEffect(() => {
    setLoadingComments(true);
    api.tasks
      .comments(task.id)
      .then(setComments)
      .catch(() => setError("Comments could not be loaded."))
      .finally(() => setLoadingComments(false));
  }, [task.id]);

  useProjectSocket(task.project_id, (event: ProjectSocketEvent) => {
    if (event.type === "comment.created" && event.payload.task_id === task.id) {
      setComments((current) => {
        if (current.some((item) => item.id === event.payload.comment.id)) return current;
        return [...current, event.payload.comment];
      });
    }
  });

  async function saveTask(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      let updated = await api.tasks.update(task.id, {
        title: draft.title.trim(),
        description: draft.description.trim(),
        priority: draft.priority,
        due_date: draft.due_date ? new Date(`${draft.due_date}T12:00:00`).toISOString() : null,
        assignee_id: draft.assignee_id || null,
      });

      if (draft.status !== updated.status) {
        updated = await api.tasks.updateStatus(task.id, draft.status);
      }

      onUpdated(updated);
      setEditing(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save task.");
    } finally {
      setSaving(false);
    }
  }

  async function addComment(event: FormEvent) {
    event.preventDefault();
    if (!comment.trim()) return;
    setSaving(true);
    setError("");
    try {
      const created = await api.tasks.addComment(task.id, comment.trim());
      setComments((current) => {
        if (current.some((item) => item.id === created.id)) return current;
        return [...current, created];
      });
      setComment("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to add comment.");
    } finally {
      setSaving(false);
    }
  }

  async function removeTask() {
    if (!window.confirm("Delete this task? This cannot be undone.")) return;
    setSaving(true);
    try {
      await api.tasks.remove(task.id);
      onDeleted(task.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to delete task.");
      setSaving(false);
    }
  }

  const assigneeDisplay = task.assignee_name || task.assignee_email || (task.assignee_id ? "Assigned" : "Unassigned");

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="task-detail-modal" onMouseDown={(event) => event.stopPropagation()}>
        <div className="task-detail-top">
          <div className="task-detail-label">
            <span className="detail-label-dot" />
            <span>Task details</span>
          </div>
          <div className="task-detail-actions">
            <button className="icon-button" onClick={() => setEditing((value) => !value)} aria-label="Edit task">
              <Pencil size={16} />
            </button>
            <button className="icon-button danger-button" onClick={removeTask} aria-label="Delete task">
              <Trash2 size={16} />
            </button>
            <button className="icon-button" onClick={onClose} aria-label="Close modal">
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="task-detail-body">
          <div className="task-detail-main">
            {editing ? (
              <form className="stack-form" onSubmit={saveTask}>
                <label>
                  Task title
                  <input
                    autoFocus
                    value={draft.title}
                    onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                    required
                  />
                </label>
                <label>
                  Description
                  <textarea
                    rows={5}
                    value={draft.description}
                    onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
                  />
                </label>
                <div className="two-col">
                  <label>
                    Priority
                    <select
                      value={draft.priority}
                      onChange={(event) => setDraft((current) => ({ ...current, priority: event.target.value as TaskPriority }))}
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </label>
                  <label>
                    Status
                    <select
                      value={draft.status}
                      onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as TaskStatus }))}
                    >
                      <option value="todo">To do</option>
                      <option value="in_progress">In progress</option>
                      <option value="done">Done</option>
                    </select>
                  </label>
                </div>
                <label>
                  Assignee
                  <select
                    value={draft.assignee_id}
                    onChange={(event) => setDraft((current) => ({ ...current, assignee_id: event.target.value }))}
                  >
                    <option value="">Unassigned</option>
                    {assigneeOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name || option.email}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Due date
                  <input
                    type="date"
                    value={draft.due_date}
                    onChange={(event) => setDraft((current) => ({ ...current, due_date: event.target.value }))}
                  />
                </label>
                <div className="modal-actions">
                  <button type="button" className="secondary-button" onClick={() => setEditing(false)}>
                    Cancel
                  </button>
                  <button className="primary-button" disabled={saving}>
                    {saving ? "Saving…" : "Save changes"}
                    <Check size={15} />
                  </button>
                </div>
              </form>
            ) : (
              <>
                <div className="task-detail-title-row">
                  <h2>{task.title}</h2>
                  <PriorityPill priority={task.priority} />
                </div>
                <div className="task-detail-status">
                  <StatusPill status={task.status} />
                  {task.due_date && (
                    <span>
                      <CalendarDays size={14} /> Due{" "}
                      {new Date(task.due_date).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                  )}
                </div>
                <p className="task-description">{task.description || "No description has been added to this task yet."}</p>
                <div className="task-info-grid">
                  <div>
                    <span>Created</span>
                    <strong>
                      {task.created_by_name ||
                        new Date(task.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </strong>
                  </div>
                  <div>
                    <span>Assignee</span>
                    <strong>{assigneeDisplay}</strong>
                  </div>
                </div>
              </>
            )}
          </div>
          <aside className="comments-panel">
            <div className="comments-heading">
              <div>
                <MessageCircle size={17} />
                <h3>Comments</h3>
              </div>
              <span>{comments.length}</span>
            </div>
            {error && <div className="form-error compact-error">{error}</div>}
            <div className="comments-list">
              {loadingComments ? (
                <div className="comments-loading">Loading comments…</div>
              ) : comments.length ? (
                comments.map((item) => (
                  <div className="comment-item" key={item.id}>
                    <span className="comment-avatar">{authorInitials(item)}</span>
                    <div>
                      <div className="comment-meta">
                        <strong>{authorLabel(item)}</strong>
                        <span>{formatRelativeTime(item.created_at)}</span>
                      </div>
                      <p>{item.content}</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="comments-empty">
                  <MessageCircle size={18} />
                  <p>No comments yet.</p>
                  <span>Be the first to add context.</span>
                </div>
              )}
            </div>
            <form className="comment-composer" onSubmit={addComment}>
              <textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Leave a note…" rows={2} />
              <button className="send-button" disabled={saving || !comment.trim()} aria-label="Send comment">
                <Send size={16} />
              </button>
            </form>
          </aside>
        </div>
      </div>
    </div>
  );
}
