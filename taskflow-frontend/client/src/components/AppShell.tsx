import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Bell, Check, ChevronDown, FolderKanban, LayoutDashboard, LogOut, Menu, Plus, Search, Settings, Sparkles, UserRound, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { Toaster } from "@/components/ui/sonner";
import { useUserSocket, type ProjectSocketEvent } from "@/hooks/useProjectSocket";
import { api } from "@/lib/api";
import type { ProjectInvitation } from "@/lib/types";

const navigation = [
  { label: "Overview", to: "/dashboard", icon: LayoutDashboard },
  { label: "Projects", to: "/projects", icon: FolderKanban },
];

export function AppShell() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [invitationMenuOpen, setInvitationMenuOpen] = useState(false);
  const [invitations, setInvitations] = useState<ProjectInvitation[]>([]);
  const [respondingTo, setRespondingTo] = useState<string | null>(null);
  const pageTitle = location.pathname.startsWith("/projects/") ? "Project workspace" : location.pathname.includes("projects") ? "Projects" : "Overview";

  useEffect(() => {
    if (!user) {
      setInvitations([]);
      return;
    }
    api.invitations.list().then(setInvitations).catch(() => setInvitations([]));
  }, [user?.id]);

  const handleRealtimeEvent = useCallback((event: ProjectSocketEvent) => {
    const openProject = () => navigate(`/projects/${event.project_id}`);
    const action = event.project_id && event.type !== "project.deleted" && event.type !== "project.member_removed"
      ? { label: "Open project", onClick: openProject }
      : undefined;

    switch (event.type) {
      case "invitation.received":
        setInvitations((current) => current.some((item) => item.id === event.payload.id) ? current : [event.payload, ...current]);
        toast.success("Project invitation", {
          description: `${event.payload.inviter_email} invited you to ${event.payload.project_name}.`,
          action: { label: "Review", onClick: () => setInvitationMenuOpen(true) },
        });
        break;
      case "invitation.sent":
        toast.success("Invitation sent", { description: `Waiting for ${event.payload.invitee_email} to respond.` });
        break;
      case "invitation.cancelled":
        setInvitations((current) => current.filter((item) => item.id !== event.payload.id));
        toast("Invitation cancelled", { description: `The invitation to ${event.payload.invitee_email} was cancelled.` });
        break;
      case "invitation.accepted":
        setInvitations((current) => current.filter((item) => item.id !== event.payload.invitation.id));
        if (event.payload.invitation.invitee_id !== user?.id) {
          toast.success("Invitation accepted", { description: `${event.payload.invitation.invitee_email} joined ${event.payload.invitation.project_name}.`, action });
        }
        break;
      case "invitation.rejected":
        setInvitations((current) => current.filter((item) => item.id !== event.payload.invitation.id));
        if (event.payload.invitation.invitee_id !== user?.id) {
          toast("Invitation declined", { description: `${event.payload.invitation.invitee_email} declined ${event.payload.invitation.project_name}.` });
        }
        break;
      case "project.created":
        toast.success("New project added", { description: "A project is now available in your workspace.", action });
        break;
      case "project.deleted":
        toast("Project deleted", { description: "A project was removed from your workspace." });
        break;
      case "project.member_removed":
        toast("Project access removed", { description: "You no longer have access to this project." });
        break;
      case "task.created":
        toast.success("Task added", { description: event.payload.title, action });
        break;
      case "task.updated":
        toast("Task updated", { description: event.payload.title, action });
        break;
      case "task.status_changed": {
        const statusLabel = { todo: "To do", in_progress: "In progress", done: "Done" }[event.payload.status];
        toast("Task status changed", { description: `${event.payload.title} moved to ${statusLabel}.`, action });
        break;
      }
      case "task.deleted":
        toast("Task deleted", { description: "A task was removed from the project.", action });
        break;
      case "comment.created":
        toast("New comment", { description: event.payload.comment.content, action });
        break;
      case "member.added":
        toast.success("Member added", { description: event.payload.email || "A new member joined the project.", action });
        break;
      case "member.removed":
        toast("Member removed", { description: "A member was removed from the project.", action });
        break;
    }
  }, [navigate, user?.id]);

  useUserSocket(handleRealtimeEvent);

  async function handleSignOut() {
    await signOut();
    navigate("/login");
  }

  async function respondToInvitation(invitation: ProjectInvitation, accept: boolean) {
    setRespondingTo(invitation.id);
    try {
      await api.invitations.respond(invitation.id, accept);
      setInvitations((current) => current.filter((item) => item.id !== invitation.id));
      toast.success(accept ? "Invitation accepted" : "Invitation declined", {
        description: accept ? `You joined ${invitation.project_name}.` : `You declined ${invitation.project_name}.`,
        ...(accept ? { action: { label: "Open project", onClick: () => navigate(`/projects/${invitation.project_id}`) } } : {}),
      });
      if (accept) navigate(`/projects/${invitation.project_id}`);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Unable to respond to invitation.");
    } finally {
      setRespondingTo(null);
    }
  }

  return (
    <div className="app-frame">
      <Toaster position="top-right" closeButton richColors />
      <div className={`mobile-scrim ${mobileOpen ? "is-visible" : ""}`} onClick={() => setMobileOpen(false)} />
      <aside className={`sidebar ${mobileOpen ? "is-open" : ""}`}>
        <div className="sidebar-topline">
          <NavLink to="/dashboard" className="brand-lockup" onClick={() => setMobileOpen(false)}>
            <span className="brand-mark"><Sparkles size={17} strokeWidth={2.6} /></span>
            <span>taskflow<span className="brand-dot">.</span></span>
          </NavLink>
          <button className="icon-button sidebar-close" onClick={() => setMobileOpen(false)} aria-label="Close navigation"><X size={18} /></button>
        </div>

        <div className="workspace-switcher">
          <div className="workspace-avatar">TF</div>
          <div className="workspace-meta">
            <span className="eyebrow">Workspace</span>
            <strong>Team Flow</strong>
          </div>
          <ChevronDown size={15} className="muted-icon" />
        </div>

        <nav className="side-nav" aria-label="Primary navigation">
          <span className="nav-section-label">Workspace</span>
          {navigation.map(({ label, to, icon: Icon }) => (
            <NavLink key={to} to={to} className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`} onClick={() => setMobileOpen(false)}>
              <Icon size={18} strokeWidth={1.9} />
              <span>{label}</span>
            </NavLink>
          ))}
          <NavLink to="/projects?new=1" className="nav-link nav-link-subtle" onClick={() => setMobileOpen(false)}>
            <Plus size={17} strokeWidth={1.9} />
            <span>New project</span>
          </NavLink>
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-callout">
            <span className="callout-orb"><Sparkles size={15} /></span>
            <div>
              <strong>Keep momentum</strong>
              <p>Small steps, visible progress.</p>
            </div>
          </div>
          <div className="side-footer-links">
          <button className="nav-link nav-link-subtle" onClick={() => window.alert("Settings are coming soon.")}><Settings size={17} /><span>Settings</span></button>
            <button className="nav-link nav-link-subtle" onClick={handleSignOut}><LogOut size={17} /><span>Sign out</span></button>
          </div>
        </div>
      </aside>

      <main className="main-canvas">
        <header className="topbar">
          <div className="topbar-leading">
            <button className="icon-button mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu size={21} /></button>
            <div className="breadcrumb"><span className="breadcrumb-muted">TaskFlow</span><span className="breadcrumb-slash">/</span><span>{pageTitle}</span></div>
          </div>
          <div className="topbar-actions">
            <button className="search-trigger" onClick={() => navigate("/projects")}><Search size={16} /><span>Search projects</span><kbd>⌘ K</kbd></button>
            <div className="invitation-wrap">
              <button
                className="icon-button notification-button"
                aria-label={`Invitations${invitations.length ? `, ${invitations.length} pending` : ""}`}
                aria-expanded={invitationMenuOpen}
                onClick={() => setInvitationMenuOpen((open) => !open)}
              >
                <Bell size={18} />
                {invitations.length > 0 && <span className="invitation-count">{invitations.length}</span>}
              </button>
              {invitationMenuOpen && (
                <div className="invitation-menu">
                  <div className="invitation-menu-heading">
                    <strong>Project invitations</strong>
                    <span>{invitations.length} pending</span>
                  </div>
                  {invitations.length ? invitations.map((invitation) => (
                    <div className="invitation-item" key={invitation.id}>
                      <div className="invitation-copy">
                        <strong>{invitation.project_name}</strong>
                        <span>Invited by {invitation.inviter_name || invitation.inviter_email}</span>
                      </div>
                      <div className="invitation-actions">
                        <button type="button" className="accept-invitation" disabled={respondingTo === invitation.id} onClick={() => void respondToInvitation(invitation, true)}>
                          <Check size={14} /> Accept
                        </button>
                        <button type="button" className="decline-invitation" disabled={respondingTo === invitation.id} onClick={() => void respondToInvitation(invitation, false)}>
                          Decline
                        </button>
                      </div>
                    </div>
                  )) : <p className="invitation-empty">No pending invitations.</p>}
                </div>
              )}
            </div>
            <div className="profile-wrap">
              <button className="profile-trigger" onClick={() => setProfileOpen((open) => !open)}>
                <span className="user-avatar">{user?.name?.slice(0, 1).toUpperCase() || "A"}</span>
                <span className="profile-copy"><strong>{user?.name || "Alex Morgan"}</strong><small>Product lead</small></span>
                <ChevronDown size={15} className="muted-icon" />
              </button>
              {profileOpen && <div className="profile-menu">
                <div className="profile-menu-heading"><UserRound size={15} /><span>{user?.email || "alex@example.com"}</span></div>
                <button onClick={handleSignOut}><LogOut size={15} /> Sign out</button>
              </div>}
            </div>
          </div>
        </header>
        <div className="page-content"><Outlet /></div>
      </main>
    </div>
  );
}
