import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowUpRight, CheckCircle2, ChevronRight, CircleDashed, FolderKanban, ListTodo, Plus, RefreshCw, Timer } from "lucide-react";
import { api } from "@/lib/api";
import type { DashboardSummary, Project, User } from "@/lib/types";
import { formatRelativeTime, StatCard } from "@/components/TaskComponents";
import { useAuth } from "@/contexts/AuthContext";
import { useUserSocket, type ProjectSocketEvent } from "@/hooks/useProjectSocket";

function LoadingBlock() {
  return <div className="loading-page"><div className="loader-ring" /><p>Loading your workspace…</p></div>;
}

export function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true); setError("");
    try { const [dashboard, projectList] = await Promise.all([api.dashboard(), api.projects.list()]); setSummary(dashboard); setProjects(projectList); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "We couldn't load your workspace."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  useUserSocket((event: ProjectSocketEvent) => {
    if (event.type === "project.created") {
      setProjects((current) => current.some((project) => project.id === event.payload.id) ? current : [event.payload, ...current]);
      setSummary((current) => current ? { ...current, project_count: current.project_count + 1 } : current);
      return;
    }
    if (event.type === "project.deleted") {
      setProjects((current) => current.filter((project) => project.id !== event.payload.id));
      setSummary((current) => current ? { ...current, project_count: Math.max(0, current.project_count - 1) } : current);
      return;
    }
    void Promise.all([api.dashboard(), api.projects.list()])
      .then(([dashboard, projectList]) => { setSummary(dashboard); setProjects(projectList); })
      .catch(() => undefined);
  });

  if (loading) return <LoadingBlock />;
  if (error || !summary) return <ErrorPanel message={error || "No dashboard data available."} onRetry={load} />;

  const firstName = user?.name?.split(" ")[0] || "there";
  const completionTotal = summary.assigned_tasks.todo + summary.assigned_tasks.in_progress + summary.assigned_tasks.done;
  const completionPercent = completionTotal ? Math.round((summary.assigned_tasks.done / completionTotal) * 100) : 0;
  return <div className="dashboard-page page-enter">
    <section className="page-heading dashboard-heading"><div><span className="eyebrow coral">{getDayPart()}, {firstName}</span><h1>Make space for <em>good work.</em></h1><p>Here’s the pulse of your workspace today.</p></div><button className="primary-button" onClick={() => navigate("/projects?new=1")}><Plus size={17} /> New project</button></section>
    <section className="stat-grid"><StatCard label="Active projects" value={summary.project_count} helper="Across your workspace" icon={FolderKanban} accent="lavender" /><StatCard label="Tasks assigned to you" value={completionTotal} helper={`${summary.assigned_tasks.in_progress} in progress right now`} icon={ListTodo} accent="mint" /><StatCard label="Completed this week" value={summary.tasks_completed_this_week} helper="Nice work — keep it going" icon={CheckCircle2} accent="peach" /><StatCard label="Open task leader" value={summary.project_with_most_open_tasks || "No open tasks"} helper="Most to focus on next" icon={Timer} accent="blue" /></section>
    <section className="dashboard-grid">
      <div className="surface-card focus-card"><div className="card-heading"><div><span className="eyebrow">Your focus</span><h2>Assigned task flow</h2></div><Link to="/projects" className="inline-link">View projects <ArrowUpRight size={15} /></Link></div><div className="flow-layout"><div className="donut-wrap" style={{ "--progress": `${completionPercent * 3.6}deg` } as CSSProperties}><div className="donut-inner"><strong>{completionPercent}%</strong><span>complete</span></div></div><div className="flow-legend"><LegendRow color="dot-lavender" label="To do" value={summary.assigned_tasks.todo} /><LegendRow color="dot-mint" label="In progress" value={summary.assigned_tasks.in_progress} /><LegendRow color="dot-coral" label="Done" value={summary.assigned_tasks.done} /></div></div><div className="progress-note"><span><CircleDashed size={15} /> Keep the streak alive</span><strong>{summary.tasks_completed_this_week} tasks shipped this week</strong></div></div>
      <div className="surface-card activity-card"><div className="card-heading"><div><span className="eyebrow">The latest</span><h2>Personal activity</h2></div><button className="icon-button ghost-button" onClick={load} aria-label="Refresh activity"><RefreshCw size={16} /></button></div><div className="activity-list">{summary.recent_personal_activity.length ? summary.recent_personal_activity.slice(0, 5).map((activity) => <div className="activity-item" key={activity.id}><span className="activity-avatar">{activity.type.slice(0, 1).toUpperCase()}</span><div><p>{activity.message}</p><span>{formatRelativeTime(activity.created_at)}</span></div></div>) : <div className="empty-compact">No activity yet. Your next move will show up here.</div>}</div></div>
    </section>
    <section className="surface-card projects-preview"><div className="card-heading"><div><span className="eyebrow">Your spaces</span><h2>Recent projects</h2></div><Link to="/projects" className="inline-link">All projects <ChevronRight size={15} /></Link></div><div className="project-preview-grid">{projects.slice(0, 3).map((project, index) => <Link className="project-preview" to={`/projects/${project.id}`} key={project.id}><span className={`project-color color-${index % 4}`}><FolderKanban size={17} /></span><div><strong>{project.name}</strong><span>{project.description || "No description added"}</span></div><ArrowUpRight size={16} className="project-arrow" /></Link>)}{!projects.length && <div className="empty-compact">No projects yet. Create your first one to get moving.</div>}</div></section>
  </div>;
}

function LegendRow({ color, label, value }: { color: string; label: string; value: number }) { return <div className="legend-row"><span className={`legend-dot ${color}`} /><span>{label}</span><strong>{value}</strong></div>; }

export function ProjectsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [memberQuery, setMemberQuery] = useState("");
  const [memberPickerOpen, setMemberPickerOpen] = useState(false);
  const [availableMembers, setAvailableMembers] = useState<User[]>([]);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  async function load() { setLoading(true); setError(""); try { setProjects(await api.projects.list()); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load projects."); } finally { setLoading(false); } }

  async function loadAvailableMembers() {
    try {
      const members = await api.users.list();
      setAvailableMembers(members.filter((member) => member.id !== user?.id));
    } catch {
      setAvailableMembers([]);
    }
  }

  useEffect(() => { void load(); void loadAvailableMembers(); const shouldOpen = new URLSearchParams(window.location.search).get("new") === "1"; if (shouldOpen) setShowCreate(true); }, []);
  useUserSocket((event: ProjectSocketEvent) => {
    if (event.type === "project.created") {
      setProjects((current) => current.some((project) => project.id === event.payload.id) ? current : [event.payload, ...current]);
      return;
    }
    if (event.type === "project.deleted") {
      setProjects((current) => current.filter((project) => project.id !== event.payload.id));
      return;
    }
    void api.projects.list().then(setProjects).catch((cause) => setError(cause instanceof Error ? cause.message : "Unable to refresh projects."));
  });
  const filtered = useMemo(() => projects.filter((project) => `${project.name} ${project.description || ""}`.toLowerCase().includes(search.toLowerCase())), [projects, search]);
  const filteredMembers = useMemo(() => {
    const query = memberQuery.trim().toLowerCase();
    return availableMembers.filter((member) => {
      const haystack = `${member.email} ${member.name || ""}`.toLowerCase();
      return !query || haystack.includes(query);
    });
  }, [availableMembers, memberQuery]);
  const selectedMembers = useMemo(
    () => availableMembers.filter((member) => selectedMemberIds.includes(member.id)),
    [availableMembers, selectedMemberIds],
  );

  async function createProject(event: React.FormEvent) { event.preventDefault(); if (!name.trim()) return; setSubmitting(true); setError(""); try { const project = await api.projects.create({ name: name.trim(), description: description.trim() || undefined, member_ids: selectedMemberIds }); setProjects((current) => [project, ...current]); setName(""); setDescription(""); setMemberQuery(""); setSelectedMemberIds([]); setMemberPickerOpen(false); setShowCreate(false); navigate(`/projects/${project.id}`); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to create project."); } finally { setSubmitting(false); } }

  function toggleMemberSelection(memberId: string) {
    setSelectedMemberIds((current) => current.includes(memberId) ? current.filter((id) => id !== memberId) : [...current, memberId]);
  }

  return <div className="projects-page page-enter"><section className="page-heading"><div><span className="eyebrow coral">Workspace</span><h1>Your projects.</h1><p>Keep every initiative moving with a clear next step.</p></div><button className="primary-button" onClick={() => setShowCreate(true)}><Plus size={17} /> New project</button></section>{error && <div className="inline-error">{error}<button onClick={load}>Try again</button></div>}<div className="projects-toolbar"><div className="search-field"><span>⌕</span><input placeholder="Search projects" value={search} onChange={(event) => setSearch(event.target.value)} /></div><span className="result-count">{filtered.length} {filtered.length === 1 ? "project" : "projects"}</span></div>{loading ? <div className="project-grid"><ProjectSkeleton /><ProjectSkeleton /><ProjectSkeleton /></div> : filtered.length ? <div className="project-grid">{filtered.map((project, index) => <Link to={`/projects/${project.id}`} className="project-card" key={project.id}><div className={`project-card-banner banner-${index % 4}`}><span className="project-card-icon"><FolderKanban size={20} /></span><span className="project-card-menu">•••</span></div><div className="project-card-body"><div className="project-card-title"><h3>{project.name}</h3><ArrowUpRight size={17} /></div><p>{project.description || "No description yet. Add context to help your team move faster."}</p><div className="project-card-footer"><span className="mini-avatar">{project.name.slice(0, 1).toUpperCase()}</span><span>Updated {new Date(project.updated_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span><span className="card-footer-arrow"><ChevronRight size={15} /></span></div></div></Link>)}</div> : <div className="empty-large"><span className="empty-state-icon"><FolderKanban size={21} /></span><h3>{search ? "No projects match that search" : "Your first project starts here"}</h3><p>{search ? "Try a different project name or description." : "Create a shared space for the work you want to move forward."}</p>{!search && <button className="secondary-button" onClick={() => setShowCreate(true)}><Plus size={16} /> Create project</button>}</div>}
    {showCreate && <div className="modal-backdrop" onMouseDown={() => setShowCreate(false)}><div className="modal-card" onMouseDown={(event) => event.stopPropagation()}><div className="modal-heading"><div><span className="eyebrow coral">New space</span><h2>Create a project</h2><p>Give your team a clear place to focus.</p></div><button className="icon-button" onClick={() => setShowCreate(false)}>×</button></div><form className="stack-form" onSubmit={createProject}><label>Project name<input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Product launch" required /></label><label>Description <span className="label-hint">Optional</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What are you hoping to accomplish?" rows={4} /></label><div className="assignee-picker"><label>Invite members <span className="label-hint">Optional</span></label><div className="assignee-dropdown"><button type="button" className="assignee-trigger" aria-expanded={memberPickerOpen} onClick={() => setMemberPickerOpen((open) => !open)}><span className="assignee-trigger-copy"><strong>{selectedMembers.length ? "Selected" : "No members"}</strong><small>{selectedMembers.length ? selectedMembers.map((member) => member.email).join(", ") : "Add teammates by email"}</small></span><ChevronRight size={16} /></button>{memberPickerOpen && <div className="assignee-menu"><div className="assignee-menu-inner"><div className="assignee-search"><input value={memberQuery} onChange={(event) => setMemberQuery(event.target.value)} placeholder="Search by email" /></div>{filteredMembers.length ? filteredMembers.map((member) => <button key={member.id} type="button" className={`assignee-option ${selectedMemberIds.includes(member.id) ? "selected" : ""}`} onClick={() => { toggleMemberSelection(member.id); setMemberQuery(""); }}><span className="assignee-avatar">{(member.email || "U").slice(0, 2).toUpperCase()}</span><span className="assignee-copy"><strong>{member.email}</strong><small>{member.name || "Member"}</small></span>{selectedMemberIds.includes(member.id) ? <CheckCircle2 size={14} /> : <Plus size={14} />}</button>) : <div className="assignee-empty">No matching emails</div>}</div></div>}</div></div><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setShowCreate(false)}>Cancel</button><button className="primary-button" disabled={submitting}>{submitting ? "Creating…" : "Create project"}<ArrowUpRight size={15} /></button></div></form></div></div>}
  </div>;
}

function ProjectSkeleton() { return <div className="project-card project-skeleton"><div className="skeleton skeleton-banner" /><div className="project-card-body"><span className="skeleton skeleton-line wide" /><span className="skeleton skeleton-line full" /><span className="skeleton skeleton-line narrow" /></div></div>; }
function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) { return <div className="error-panel"><span>We hit a snag</span><p>{message}</p><button className="secondary-button" onClick={onRetry}><RefreshCw size={15} /> Retry</button></div>; }
function getDayPart() { const hour = new Date().getHours(); return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"; }
