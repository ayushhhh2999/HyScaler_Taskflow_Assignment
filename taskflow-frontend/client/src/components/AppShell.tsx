import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Bell, ChevronDown, FolderKanban, LayoutDashboard, LogOut, Menu, Plus, Search, Settings, Sparkles, UserRound, X } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";

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
  const pageTitle = location.pathname.startsWith("/projects/") ? "Project workspace" : location.pathname.includes("projects") ? "Projects" : "Overview";

  async function handleSignOut() {
    await signOut();
    navigate("/login");
  }

  return (
    <div className="app-frame">
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
            <button className="icon-button notification-button" aria-label="Notifications"><Bell size={18} /><i /></button>
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
