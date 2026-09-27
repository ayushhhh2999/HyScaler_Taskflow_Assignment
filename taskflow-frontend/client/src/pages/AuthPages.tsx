import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail, Sparkles, UserRound } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

function AuthLayout({ children, eyebrow, title, description }: { children: React.ReactNode; eyebrow: string; title: string; description: string }) {
  return <div className="auth-page"><div className="auth-art"><div className="auth-art-top"><Link to="/login" className="brand-lockup light"><span className="brand-mark"><Sparkles size={17} /></span><span>taskflow<span className="brand-dot">.</span></span></Link><span className="auth-art-note">The calm place for busy teams</span></div><div className="art-content"><div className="art-kicker"><span />Project clarity, in motion</div><h2>Work that feels <em>lighter.</em></h2><p>Bring projects, people, and progress into one shared rhythm.</p><div className="art-orbit"><div className="orbit-ring ring-one" /><div className="orbit-ring ring-two" /><div className="orbit-core"><Sparkles size={27} /></div><span className="orbit-label label-one">Plan</span><span className="orbit-label label-two">Build</span><span className="orbit-label label-three">Ship</span></div></div><div className="auth-art-footer"><span>© 2026 TaskFlow</span><span>Made for momentum</span></div></div><div className="auth-panel"><div className="auth-panel-inner"><div className="auth-mobile-brand"><Link to="/login" className="brand-lockup"><span className="brand-mark"><Sparkles size={17} /></span><span>taskflow<span className="brand-dot">.</span></span></Link></div><div className="auth-heading"><span className="eyebrow coral">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{children}</div></div></div>;
}

function PasswordInput({ value, onChange, placeholder = "Your password", autoComplete = "current-password" }: { value: string; onChange: (value: string) => void; placeholder?: string; autoComplete?: string }) {
  const [visible, setVisible] = useState(false);
  return <div className="input-wrap"><LockKeyhole size={17} className="input-icon" /><input type={visible ? "text" : "password"} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} autoComplete={autoComplete} required /><button type="button" className="password-toggle" onClick={() => setVisible((current) => !current)} aria-label={visible ? "Hide password" : "Show password"}>{visible ? <EyeOff size={16} /> : <Eye size={16} />}</button></div>;
}

export function LoginPage() {
  const { signIn, error, clearError, isLoading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLocalError("");
    clearError();
    setSubmitting(true);
    try { await signIn(email, password); navigate("/dashboard"); } catch { /* context renders the API message */ } finally { setSubmitting(false); }
  }

  return <AuthLayout eyebrow="Welcome back" title="Good to see you again." description="Sign in to pick up where you left off."><form className="auth-form" onSubmit={submit}><label>Email address<div className="input-wrap"><Mail size={17} className="input-icon" /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} onFocus={clearError} placeholder="you@company.com" autoComplete="email" required /></div></label><label>Password<PasswordInput value={password} onChange={setPassword} /></label><div className="form-row between"><label className="checkbox-label"><input type="checkbox" /> <span>Remember me</span></label><button type="button" className="text-link">Forgot password?</button></div>{(error || localError) && <div className="form-error">{error || localError}</div>}<button className="primary-button full-width" disabled={submitting || isLoading}>{submitting ? "Signing in…" : "Sign in"}<ArrowRight size={17} /></button><p className="auth-switch">New to TaskFlow? <Link to="/register">Create an account</Link></p></form></AuthLayout>;
}

export function RegisterPage() {
  const { signUp, error, clearError, isLoading } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    clearError();
    setSubmitting(true);
    try { await signUp(name, email, password); navigate("/dashboard"); } catch { /* context renders the API message */ } finally { setSubmitting(false); }
  }

  return <AuthLayout eyebrow="Start together" title="A better way to move work forward." description="Create your workspace and make progress visible from day one."><form className="auth-form" onSubmit={submit}><label>Your name<div className="input-wrap"><UserRound size={17} className="input-icon" /><input type="text" value={name} onChange={(event) => setName(event.target.value)} placeholder="Alex Morgan" autoComplete="name" required /></div></label><label>Email address<div className="input-wrap"><Mail size={17} className="input-icon" /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" autoComplete="email" required /></div></label><label>Password<PasswordInput value={password} onChange={setPassword} placeholder="At least 8 characters" autoComplete="new-password" /></label>{error && <div className="form-error">{error}</div>}<button className="primary-button full-width" disabled={submitting || isLoading}>{submitting ? "Creating workspace…" : "Create account"}<ArrowRight size={17} /></button><p className="auth-legal">By creating an account, you agree to keep your workspace kind, clear, and collaborative.</p><p className="auth-switch">Already have an account? <Link to="/login">Sign in</Link></p></form></AuthLayout>;
}
