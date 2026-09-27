import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { AppShell } from "@/components/AppShell";
import { LoginPage, RegisterPage } from "@/pages/AuthPages";
import { DashboardPage, ProjectsPage } from "@/pages/DashboardPages";
import { ProjectDetailPage } from "@/pages/ProjectDetailPage";

function LoadingScreen() { return <div className="loading-screen"><div className="loader-ring" /><span>Loading TaskFlow…</span></div>; }

function ProtectedRoute() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <LoadingScreen />;
  return user ? <Outlet /> : <Navigate to="/login" replace />;
}

function PublicRoute() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <LoadingScreen />;
  return user ? <Navigate to="/dashboard" replace /> : <Outlet />;
}

function NotFound() { return <div className="not-found"><span className="eyebrow coral">404</span><h1>That page wandered off.</h1><p>Let's get you back to a useful place.</p><a className="primary-button" href="/dashboard">Back to overview</a></div>; }

export default function App() {
  return <Routes><Route element={<PublicRoute />}><Route path="/login" element={<LoginPage />} /><Route path="/register" element={<RegisterPage />} /></Route><Route element={<ProtectedRoute />}><Route element={<AppShell />}><Route index element={<Navigate to="/dashboard" replace />} /><Route path="/dashboard" element={<DashboardPage />} /><Route path="/projects" element={<ProjectsPage />} /><Route path="/projects/:projectId" element={<ProjectDetailPage />} /></Route></Route><Route path="*" element={<NotFound />} /></Routes>;
}
