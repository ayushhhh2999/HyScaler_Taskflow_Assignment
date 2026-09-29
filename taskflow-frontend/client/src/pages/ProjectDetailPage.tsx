import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  CirclePlus,
  Filter,
  FolderKanban,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import type { Member, Project, ProjectInvitation, Task, TaskPriority, TaskStatus, User } from "@/lib/types";
import { EmptyTaskState, KanbanCard } from "@/components/TaskComponents";
import { TaskDetailModal } from "@/components/TaskDetailModal";
import { useProjectSocket, useUserSocket, type ProjectSocketEvent } from "@/hooks/useProjectSocket";

const tabs = ["Tasks", "Members"] as const;
type ProjectTab = (typeof tabs)[number];

const KANBAN_COLUMNS: { status: TaskStatus; title: string }[] = [
  { status: "todo", title: "To do" },
  { status: "in_progress", title: "In progress" },
  { status: "done", title: "Done" },
];

function upsertTask(tasks: Task[], task: Task) {
  const index = tasks.findIndex((item) => item.id === task.id);
  if (index === -1) return [task, ...tasks];
  const next = [...tasks];
  next[index] = task;
  return next;
}

export function ProjectDetailPage() {
  const { projectId = "" } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [pendingInvitations, setPendingInvitations] = useState<ProjectInvitation[]>([]);
  const [assigneeOptions, setAssigneeOptions] = useState<User[]>([]);
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<ProjectTab>("Tasks");
  const [taskSearch, setTaskSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<"all" | TaskPriority>("all");
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);

  async function loadWorkspace() {
    if (!projectId) return;
    setLoading(true);
    setError("");
    try {
      const [projectResponse, tasksResponse, membersResponse, assigneeResponse, usersResponse] = await Promise.all([
        api.projects.get(projectId),
        api.projects.tasks(projectId),
        api.projects.members(projectId),
        api.projects.assigneeOptions(projectId),
        api.users.list().catch(() => [] as User[]),
      ]);
      setProject(projectResponse);
      setTasks(tasksResponse);
      setMembers(membersResponse);
      setAssigneeOptions(assigneeResponse);
      setAvailableUsers(usersResponse);
      if (projectResponse.owner_id === user?.id) {
        setPendingInvitations(await api.projects.invitations(projectId).catch(() => [] as ProjectInvitation[]));
      } else {
        setPendingInvitations([]);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load this project.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadWorkspace();
  }, [projectId]);

  const handleSocketEvent = useCallback((event: ProjectSocketEvent) => {
    if (event.type === "project.deleted") {
      navigate("/projects", { replace: true });
      return;
    }
    if (event.type === "invitation.sent" && event.project_id === projectId) {
      setPendingInvitations((current) => current.some((item) => item.id === event.payload.id) ? current : [...current, event.payload]);
      return;
    }
    if (event.type === "invitation.cancelled" && event.project_id === projectId) {
      setPendingInvitations((current) => current.filter((item) => item.id !== event.payload.id));
      return;
    }
    if ((event.type === "invitation.accepted" || event.type === "invitation.rejected") && event.project_id === projectId) {
      setPendingInvitations((current) => current.filter((item) => item.id !== event.payload.invitation.id));
      if (event.type === "invitation.accepted") {
        const acceptedMember = event.payload.member;
        setMembers((current) => current.some((item) => item.user_id === acceptedMember.user_id) ? current : [...current, acceptedMember]);
        setAssigneeOptions((current) => current.some((item) => item.id === acceptedMember.user_id)
          ? current
          : [...current, { id: acceptedMember.user_id, name: acceptedMember.name || "", email: acceptedMember.email || "" }]);
      }
      return;
    }
    if (event.type === "task.created" || event.type === "task.updated" || event.type === "task.status_changed") {
      setTasks((current) => upsertTask(current, event.payload));
      setSelectedTask((current) => (current?.id === event.payload.id ? event.payload : current));
      return;
    }
    if (event.type === "task.deleted") {
      setTasks((current) => current.filter((task) => task.id !== event.payload.id));
      setSelectedTask((current) => (current?.id === event.payload.id ? null : current));
      return;
    }
    if (event.type === "member.added") {
      setMembers((current) => {
        if (current.some((member) => member.user_id === event.payload.user_id)) return current;
        return [...current, event.payload];
      });
      setAssigneeOptions((current) => {
        if (current.some((option) => option.id === event.payload.user_id)) return current;
        return [
          ...current,
          {
            id: event.payload.user_id,
            name: event.payload.name || "",
            email: event.payload.email || "",
          },
        ];
      });
      return;
    }
    if (event.type === "member.removed") {
      setMembers((current) => current.filter((member) => member.user_id !== event.payload.user_id));
      setAssigneeOptions((current) => current.filter((option) => option.id !== event.payload.user_id));
      setTasks((current) =>
        current.map((task) =>
          task.assignee_id === event.payload.user_id
            ? { ...task, assignee_id: null, assignee_name: null, assignee_email: null }
            : task,
        ),
      );
    }
  }, [navigate, projectId, user?.id]);

  const handleAccessRevoked = useCallback((event: ProjectSocketEvent) => {
    if (event.type === "project.member_removed" && event.project_id === projectId && event.payload.user_id === user?.id) {
      navigate("/projects", { replace: true });
    }
  }, [navigate, projectId, user?.id]);

  useProjectSocket(projectId, handleSocketEvent);
  useUserSocket(handleAccessRevoked);

  const visibleTasks = useMemo(
    () =>
      tasks.filter((task) => {
        const searchMatch = `${task.title} ${task.description || ""}`.toLowerCase().includes(taskSearch.toLowerCase());
        return searchMatch && (priorityFilter === "all" || task.priority === priorityFilter);
      }),
    [priorityFilter, taskSearch, tasks],
  );

  const tasksByStatus = useMemo(() => {
    const grouped: Record<TaskStatus, Task[]> = { todo: [], in_progress: [], done: [] };
    for (const task of visibleTasks) grouped[task.status].push(task);
    return grouped;
  }, [visibleTasks]);

  const taskCounts = useMemo(
    () => ({
      all: tasks.length,
      todo: tasks.filter((task) => task.status === "todo").length,
      in_progress: tasks.filter((task) => task.status === "in_progress").length,
      done: tasks.filter((task) => task.status === "done").length,
    }),
    [tasks],
  );

  const isProjectOwner = Boolean(project && user && project.owner_id === user.id);
  const inviteCandidates = useMemo(() => {
    const memberIds = new Set(members.map((member) => member.user_id));
    return availableUsers.filter((candidate) => candidate.id !== user?.id && !memberIds.has(candidate.id));
  }, [availableUsers, members, user?.id]);

  async function updateStatus(task: Task, status: TaskStatus) {
    if (task.status === status) return;
    const previous = tasks;
    setTasks((current) =>
      current.map((item) =>
        item.id === task.id
          ? { ...item, status, completed_at: status === "done" ? new Date().toISOString() : null }
          : item,
      ),
    );
    try {
      const updated = await api.tasks.updateStatus(task.id, status);
      setTasks((current) => upsertTask(current, updated));
    } catch {
      setTasks(previous);
    }
  }

  async function removeMember(userId: string) {
    if (!projectId || !window.confirm("Remove this member from the project? Their task history will stay, but they will lose access.")) return;
    try {
      await api.projects.removeMember(projectId, userId);
      setMembers((current) => current.filter((member) => member.user_id !== userId));
      setAssigneeOptions((current) => current.filter((option) => option.id !== userId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to remove member.");
    }
  }

  async function cancelInvitation(invitationId: string) {
    if (!projectId || !window.confirm("Cancel this pending invitation?")) return;
    try {
      await api.projects.cancelInvitation(projectId, invitationId);
      setPendingInvitations((current) => current.filter((invitation) => invitation.id !== invitationId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to cancel invitation.");
    }
  }

  async function deleteProject() {
    if (!projectId || !window.confirm("Delete this project? This cannot be undone.")) return;
    try {
      await api.projects.remove(projectId);
      navigate("/projects");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to delete project.");
    }
  }

  async function refreshTasks() {
    setRefreshing(true);
    try {
      setTasks(await api.projects.tasks(projectId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to refresh tasks.");
    } finally {
      setRefreshing(false);
    }
  }

  if (loading) {
    return (
      <div className="project-detail-page">
        <div className="back-link-placeholder" />
        <div className="detail-skeleton">
          <span className="skeleton skeleton-line medium" />
          <span className="skeleton skeleton-line wide heading" />
          <span className="skeleton skeleton-line full" />
          <div className="skeleton skeleton-block-large" />
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="project-detail-page">
        <Link to="/projects" className="back-link">
          <ArrowLeft size={16} /> Back to projects
        </Link>
        <div className="error-panel">
          <span>Project unavailable</span>
          <p>{error || "We couldn't find this project."}</p>
          <button className="secondary-button" onClick={loadWorkspace}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="project-detail-page page-enter">
      <Link to="/projects" className="back-link">
        <ArrowLeft size={16} /> All projects
      </Link>
      <section className="detail-heading">
        <div className="detail-heading-main">
          <span className="project-detail-icon">
            <FolderKanban size={22} />
          </span>
          <div>
            <div className="eyebrow-row">
              <span className="eyebrow coral">Project workspace</span>
              <span className="project-updated">
                Updated {new Date(project.updated_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </span>
            </div>
            <h1>{project.name}</h1>
            <p>{project.description || "A shared place to make progress visible."}</p>
          </div>
        </div>
        <div className="detail-heading-actions">
          {isProjectOwner && (
            <button className="secondary-button" onClick={() => setShowInvite(true)}>
              <UserPlus size={16} /> Invite member
            </button>
          )}
          {isProjectOwner && (
            <div className="menu-wrap">
              <button className="icon-button bordered-button" onClick={() => setShowMenu((open) => !open)} aria-label="Project actions">
                <MoreHorizontal size={18} />
              </button>
              {showMenu && (
                <div className="action-menu">
                  <button onClick={deleteProject}>
                    <Trash2 size={15} /> Delete project
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      <div className="project-summary-row">
        <div>
          <Users size={16} />
          <strong>{members.length}</strong>
          <span>{members.length === 1 ? "member" : "members"}</span>
        </div>
        <div>
          <CirclePlus size={16} />
          <strong>{taskCounts.all}</strong>
          <span>{taskCounts.all === 1 ? "task" : "tasks"}</span>
        </div>
        <div>
          <CalendarDays size={16} />
          <strong>{taskCounts.done}</strong>
          <span>completed</span>
        </div>
      </div>

      <div className="workspace-tabs">
        {tabs.map((tab) => (
          <button key={tab} className={activeTab === tab ? "active" : ""} onClick={() => setActiveTab(tab)}>
            {tab}
            <span>{tab === "Tasks" ? taskCounts.all : members.length}</span>
          </button>
        ))}
      </div>

      {activeTab === "Tasks" ? (
        <section className="workspace-panel">
          <div className="panel-toolbar">
            <div>
              <h2>Board</h2>
              <p>Drag cards between columns to update status.</p>
            </div>
            <button className="primary-button" onClick={() => setShowCreateTask(true)}>
              <Plus size={17} /> Add task
            </button>
          </div>
          <div className="task-filters">
            <div className="search-field task-search">
              <Search size={15} />
              <input placeholder="Search tasks" value={taskSearch} onChange={(event) => setTaskSearch(event.target.value)} />
            </div>
            <label className="select-wrap">
              <Filter size={15} />
              <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value as "all" | TaskPriority)}>
                <option value="all">All priorities</option>
                <option value="high">High priority</option>
                <option value="medium">Medium priority</option>
                <option value="low">Low priority</option>
              </select>
              <ChevronDown size={14} />
            </label>
            <button className={`icon-button bordered-button refresh-button ${refreshing ? "spin" : ""}`} onClick={refreshTasks} aria-label="Refresh tasks">
              <CirclePlus size={16} />
            </button>
          </div>

          {visibleTasks.length ? (
            <div className="kanban-board">
              {KANBAN_COLUMNS.map((column) => (
                <div
                  key={column.status}
                  className={`kanban-column ${draggingTaskId ? "is-drop-target" : ""}`}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    const taskId = event.dataTransfer.getData("text/task-id") || draggingTaskId;
                    setDraggingTaskId(null);
                    if (!taskId) return;
                    const task = tasks.find((item) => item.id === taskId);
                    if (task) void updateStatus(task, column.status);
                  }}
                >
                  <div className="kanban-column-header">
                    <strong>{column.title}</strong>
                    <span>{tasksByStatus[column.status].length}</span>
                  </div>
                  <div className="kanban-column-body">
                    {tasksByStatus[column.status].map((task) => (
                      <KanbanCard
                        key={task.id}
                        task={task}
                        dragging={draggingTaskId === task.id}
                        onClick={() => setSelectedTask(task)}
                        onDragStart={() => setDraggingTaskId(task.id)}
                        onDragEnd={() => setDraggingTaskId(null)}
                      />
                    ))}
                    {!tasksByStatus[column.status].length && <div className="kanban-empty">Drop tasks here</div>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyTaskState
              title={taskSearch || priorityFilter !== "all" ? "No tasks match your filters" : "No tasks in this project yet"}
              description={
                taskSearch || priorityFilter !== "all"
                  ? "Try clearing a filter or search term."
                  : "Add the first task and make the next move visible."
              }
            />
          )}
        </section>
      ) : (
        <MembersPanel
          isOwner={isProjectOwner}
          members={members}
          pendingInvitations={pendingInvitations}
          ownerId={project.owner_id}
          onInvite={() => setShowInvite(true)}
          onRemoveMember={removeMember}
          onCancelInvitation={cancelInvitation}
        />
      )}

      {showCreateTask && (
        <CreateTaskModal
          assigneeOptions={assigneeOptions}
          onClose={() => setShowCreateTask(false)}
          onCreated={(task) => {
            setTasks((current) => upsertTask(current, task));
            setShowCreateTask(false);
          }}
          projectId={projectId}
        />
      )}
      {showInvite && (
        <InviteMemberModal
          candidates={inviteCandidates}
          projectId={projectId}
          onClose={() => setShowInvite(false)}
          onInvited={(invitation) => {
            setPendingInvitations((current) => current.some((item) => item.id === invitation.id) ? current : [...current, invitation]);
            setShowInvite(false);
          }}
        />
      )}
      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          assigneeOptions={assigneeOptions}
          onClose={() => setSelectedTask(null)}
          onUpdated={(updated) => {
            setTasks((current) => upsertTask(current, updated));
            setSelectedTask(updated);
          }}
          onDeleted={(taskId) => {
            setTasks((current) => current.filter((item) => item.id !== taskId));
            setSelectedTask(null);
          }}
        />
      )}
    </div>
  );
}

function MembersPanel({
  members,
  pendingInvitations,
  ownerId,
  isOwner,
  onInvite,
  onRemoveMember,
  onCancelInvitation,
}: {
  members: Member[];
  pendingInvitations: ProjectInvitation[];
  ownerId: string;
  isOwner: boolean;
  onInvite: () => void;
  onRemoveMember: (userId: string) => void;
  onCancelInvitation: (invitationId: string) => void;
}) {
  return (
    <section className="workspace-panel members-panel">
      <div className="panel-toolbar">
        <div>
          <h2>Members</h2>
          <p>People with access to this project.</p>
        </div>
        {isOwner && (
          <button className="primary-button" onClick={onInvite}>
            <UserPlus size={17} /> Add member
          </button>
        )}
      </div>
      {members.length ? (
        <div className="member-list">
          {members.map((member) => (
            <div className="member-row" key={`${member.project_id}-${member.user_id}`}>
              <span className="member-avatar">{(member.name || member.email || member.user_id).slice(0, 2).toUpperCase()}</span>
              <div>
                <strong>{member.name || member.email || member.user_id}</strong>
                <span>{member.email || "Project member"}</span>
              </div>
              <span className="role-pill">{member.role}</span>
              {isOwner && member.user_id !== ownerId && (
                <button className="danger-text-button" type="button" onClick={() => onRemoveMember(member.user_id)}>
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
      ) : pendingInvitations.length === 0 ? (
        <div className="empty-large compact">
          <span className="empty-state-icon">
            <Users size={20} />
          </span>
          <h3>No members yet</h3>
          <p>Invite collaborators by email to get started.</p>
          {isOwner && (
            <button className="secondary-button" onClick={onInvite}>
              <UserPlus size={15} /> Invite member
            </button>
          )}
        </div>
      ) : null}
      {pendingInvitations.length > 0 && (
        <div className="pending-invitations">
          <div className="pending-invitations-heading">
            <h3>Pending invitations</h3>
            <span>{pendingInvitations.length}</span>
          </div>
          <div className="member-list">
            {pendingInvitations.map((invitation) => (
              <div className="member-row" key={invitation.id}>
                <span className="member-avatar">{(invitation.invitee_name || invitation.invitee_email).slice(0, 2).toUpperCase()}</span>
                <div>
                  <strong>{invitation.invitee_name || invitation.invitee_email}</strong>
                  <span>{invitation.invitee_email}</span>
                </div>
                <span className="role-pill pending-role">Pending</span>
                {isOwner && <button className="danger-text-button" type="button" onClick={() => onCancelInvitation(invitation.id)}>Cancel</button>}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function CreateTaskModal({
  projectId,
  assigneeOptions,
  onClose,
  onCreated,
}: {
  projectId: string;
  assigneeOptions: User[];
  onClose: () => void;
  onCreated: (task: Task) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [assigneeId, setAssigneeId] = useState("");
  const [assigneeOpen, setAssigneeOpen] = useState(false);
  const [dueDate, setDueDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const task = await api.projects.createTask(projectId, {
        title: title.trim(),
        description: description.trim() || undefined,
        assignee_id: assigneeId.trim() || null,
        priority,
        due_date: dueDate ? new Date(`${dueDate}T12:00:00`).toISOString() : null,
      });
      onCreated(task);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to create task.");
    } finally {
      setSubmitting(false);
    }
  }

  const selectedAssignee = assigneeId ? assigneeOptions.find((assignee) => assignee.id === assigneeId) ?? null : null;

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal-card task-modal" onMouseDown={(event) => event.stopPropagation()}>
        <ModalHeader eyebrow="New task" title="Add a task" description="Turn an intention into the next clear step." onClose={onClose} />
        <form className="stack-form" onSubmit={submit}>
          <label>
            Task title
            <input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What needs to move forward?" required />
          </label>
          <label>
            Description <span className="label-hint">Optional</span>
            <textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Add useful context for collaborators" />
          </label>
          <div className="two-col">
            <label>
              Priority
              <select value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority)}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </label>
            <label>
              Due date <span className="label-hint">Optional</span>
              <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
            </label>
          </div>
          <div className="assignee-picker">
            <label>
              Assignee <span className="label-hint">Optional</span>
            </label>
            <div className="assignee-dropdown">
              <button type="button" className="assignee-trigger" aria-expanded={assigneeOpen} onClick={() => setAssigneeOpen((open) => !open)}>
                <span className="assignee-trigger-copy">
                  <strong>{selectedAssignee ? selectedAssignee.name || "Member" : "Unassigned"}</strong>
                  <small>{selectedAssignee ? selectedAssignee.email || selectedAssignee.id : "Leave task open"}</small>
                </span>
                <ChevronDown size={16} />
              </button>
              {assigneeOpen && (
                <div className="assignee-menu">
                  <div className="assignee-menu-inner">
                    {assigneeOptions.length ? (
                      <>
                        <button
                          type="button"
                          className={`assignee-option ${!assigneeId ? "selected" : ""}`}
                          onClick={() => {
                            setAssigneeId("");
                            setAssigneeOpen(false);
                          }}
                        >
                          <span className="assignee-avatar">NA</span>
                          <span className="assignee-copy">
                            <strong>Unassigned</strong>
                            <small>Leave task open</small>
                          </span>
                        </button>
                        {assigneeOptions.map((assignee) => (
                          <button
                            type="button"
                            key={assignee.id}
                            className={`assignee-option ${assigneeId === assignee.id ? "selected" : ""}`}
                            onClick={() => {
                              setAssigneeId(assignee.id);
                              setAssigneeOpen(false);
                            }}
                          >
                            <span className="assignee-avatar">{(assignee.name || assignee.email || assignee.id).slice(0, 2).toUpperCase()}</span>
                            <span className="assignee-copy">
                              <strong>{assignee.name || "Member"}</strong>
                              <small>{assignee.email || assignee.id}</small>
                            </span>
                          </button>
                        ))}
                      </>
                    ) : (
                      <div className="assignee-empty">No people available</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
          {error && <div className="form-error">{error}</div>}
          <div className="modal-actions">
            <button type="button" className="secondary-button" onClick={onClose}>
              Cancel
            </button>
            <button className="primary-button" disabled={submitting}>
              {submitting ? "Creating…" : "Create task"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function InviteMemberModal({
  projectId,
  candidates,
  onClose,
  onInvited,
}: {
  projectId: string;
  candidates: User[];
  onClose: () => void;
  onInvited: (invitation: ProjectInvitation) => void;
}) {
  const [query, setQuery] = useState("");
  const [selectedEmail, setSelectedEmail] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return candidates.filter((candidate) => {
      const haystack = `${candidate.email} ${candidate.name || ""}`.toLowerCase();
      return !needle || haystack.includes(needle);
    });
  }, [candidates, query]);

  const selected = candidates.find((candidate) => candidate.email === selectedEmail) ?? null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!selectedEmail.trim()) {
      setError("Choose a teammate by email.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      onInvited(await api.projects.inviteMember(projectId, { email: selectedEmail.trim() }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to invite member.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal-card narrow-modal" onMouseDown={(event) => event.stopPropagation()}>
        <ModalHeader eyebrow="Grow the team" title="Invite a member" description="Search by email — same flow as creating a project." onClose={onClose} />
        <form className="stack-form" onSubmit={submit}>
          <div className="assignee-picker">
            <label>
              Teammate email
            </label>
            <div className="assignee-dropdown">
              <button type="button" className="assignee-trigger" aria-expanded={pickerOpen} onClick={() => setPickerOpen((open) => !open)}>
                <span className="assignee-trigger-copy">
                  <strong>{selected ? selected.email : "Select by email"}</strong>
                  <small>{selected ? selected.name || "Member" : "Invite someone who already has an account"}</small>
                </span>
                <ChevronDown size={16} />
              </button>
              {pickerOpen && (
                <div className="assignee-menu">
                  <div className="assignee-menu-inner">
                    <div className="assignee-search">
                      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by email" autoFocus />
                    </div>
                    {filtered.length ? (
                      filtered.map((candidate) => (
                        <button
                          key={candidate.id}
                          type="button"
                          className={`assignee-option ${selectedEmail === candidate.email ? "selected" : ""}`}
                          onClick={() => {
                            setSelectedEmail(candidate.email);
                            setPickerOpen(false);
                            setQuery("");
                          }}
                        >
                          <span className="assignee-avatar">{(candidate.email || "U").slice(0, 2).toUpperCase()}</span>
                          <span className="assignee-copy">
                            <strong>{candidate.email}</strong>
                            <small>{candidate.name || "Member"}</small>
                          </span>
                          {selectedEmail === candidate.email ? <CheckCircle2 size={14} /> : <Plus size={14} />}
                        </button>
                      ))
                    ) : (
                      <div className="assignee-empty">No matching emails</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
          {error && <div className="form-error">{error}</div>}
          <div className="modal-actions">
            <button type="button" className="secondary-button" onClick={onClose}>
              Cancel
            </button>
            <button className="primary-button" disabled={submitting || !selectedEmail}>
              {submitting ? "Inviting…" : "Invite member"}
              <UserPlus size={16} />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ModalHeader({
  eyebrow,
  title,
  description,
  onClose,
}: {
  eyebrow: string;
  title: string;
  description: string;
  onClose: () => void;
}) {
  return (
    <div className="modal-heading">
      <div>
        <span className="eyebrow coral">{eyebrow}</span>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <button className="icon-button" onClick={onClose} aria-label="Close modal">
        <X size={18} />
      </button>
    </div>
  );
}
