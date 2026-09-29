import type {
  AuthResponse,
  Comment,
  DashboardSummary,
  Member,
  Project,
  ProjectCreateInput,
  ProjectInvitation,
  Task,
  TaskCreateInput,
  TaskPriority,
  TaskStatus,
  TaskUpdateInput,
  User,
} from "./types";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api/v1";
const TOKEN_KEY = "taskflow_access_token";

let accessToken = window.localStorage.getItem(TOKEN_KEY);
let refreshInFlight: Promise<string | null> | null = null;

export function getAccessToken() {
  return accessToken;
}

export function setAccessToken(token: string | null) {
  accessToken = token;
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  else window.localStorage.removeItem(TOKEN_KEY);
}

class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

async function parseError(response: Response) {
  try {
    const payload = (await response.json()) as { detail?: string; message?: string };
    return payload.detail || payload.message || `Request failed with ${response.status}`;
  } catch {
    return `Request failed with ${response.status}`;
  }
}

async function refreshAccessToken() {
  if (!refreshInFlight) {
    refreshInFlight = fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    })
      .then(async (response) => {
        if (!response.ok) return null;
        const payload = (await response.json()) as AuthResponse;
        setAccessToken(payload.access_token);
        return payload.access_token;
      })
      .catch(() => null)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

export async function getWebSocketAccessToken() {
  if (!accessToken) return null;
  try {
    const payloadPart = accessToken.split(".")[1];
    if (!payloadPart) return refreshAccessToken();
    const normalizedPayload = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(normalizedPayload)) as { exp?: number };
    if (!payload.exp || payload.exp * 1000 <= Date.now() + 30_000) return refreshAccessToken();
    return accessToken;
  } catch {
    return refreshAccessToken();
  }
}

async function request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });

  if (response.status === 401 && retry && !path.includes("/auth/refresh")) {
    const token = await refreshAccessToken();
    if (token) return request<T>(path, init, false);
    setAccessToken(null);
  }

  if (!response.ok) throw new ApiError(await parseError(response), response.status);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const api = {
  auth: {
    async login(email: string, password: string) {
      const response = await request<AuthResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setAccessToken(response.access_token);
      return response;
    },
    async register(name: string, email: string, password: string) {
      const response = await request<AuthResponse>("/auth/register", {
        method: "POST",
        body: JSON.stringify({ name, email, password }),
      });
      setAccessToken(response.access_token);
      return response;
    },
    me: () => request<User>("/auth/me"),
    async logout() {
      try {
        await request<{ status: string }>("/auth/logout", { method: "POST" }, false);
      } finally {
        setAccessToken(null);
      }
    },
  },
  dashboard: () => request<DashboardSummary>("/dashboard"),
  users: {
    list: () => request<User[]>("/users"),
  },
  projects: {
    list: () => request<Project[]>("/projects"),
    get: (projectId: string) => request<Project>(`/projects/${projectId}`),
    create: (payload: ProjectCreateInput) =>
      request<Project>("/projects", { method: "POST", body: JSON.stringify(payload) }),
    remove: (projectId: string) => request<void>(`/projects/${projectId}`, { method: "DELETE" }),
    tasks: (projectId: string, params?: { priority?: TaskPriority; search?: string; sort_order?: "asc" | "desc" }) => {
      const query = new URLSearchParams({ page: "1", limit: "100", sort_by: "created_at", sort_order: params?.sort_order || "desc" });
      if (params?.priority) query.set("priority", params.priority);
      if (params?.search) query.set("search", params.search);
      return request<Task[]>(`/projects/${projectId}/tasks?${query.toString()}`);
    },
    createTask: (projectId: string, payload: TaskCreateInput) =>
      request<Task>(`/projects/${projectId}/tasks`, { method: "POST", body: JSON.stringify(payload) }),
    members: (projectId: string) => request<Member[]>(`/projects/${projectId}/members`),
    invitations: (projectId: string) => request<ProjectInvitation[]>(`/projects/${projectId}/invitations`),
    assigneeOptions: (projectId: string) => request<User[]>(`/projects/${projectId}/assignee-options`),
    inviteMember: (projectId: string, payload: { user_id?: string; email?: string }) =>
      request<ProjectInvitation>(`/projects/${projectId}/members`, { method: "POST", body: JSON.stringify(payload) }),
    cancelInvitation: (projectId: string, invitationId: string) =>
      request<void>(`/projects/${projectId}/invitations/${invitationId}`, { method: "DELETE" }),
    removeMember: (projectId: string, userId: string) =>
      request<void>(`/projects/${projectId}/members/${userId}`, { method: "DELETE" }),
  },
  tasks: {
    get: (taskId: string) => request<Task>(`/tasks/${taskId}`),
    update: (taskId: string, payload: TaskUpdateInput) =>
      request<Task>(`/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify(payload) }),
    remove: (taskId: string) => request<void>(`/tasks/${taskId}`, { method: "DELETE" }),
    updateStatus: (taskId: string, status: TaskStatus) =>
      request<Task>(`/tasks/${taskId}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
    assignedToMe: () => request<Task[]>("/tasks/assigned-to-me"),
    comments: (taskId: string) => request<Comment[]>(`/tasks/${taskId}/comments`),
    addComment: (taskId: string, content: string) =>
      request<Comment>(`/tasks/${taskId}/comments`, { method: "POST", body: JSON.stringify({ content }) }),
  },
  invitations: {
    list: () => request<ProjectInvitation[]>("/invitations/me"),
    respond: (invitationId: string, accept: boolean) =>
      request<{ status: "accepted" | "rejected"; invitation_id: string; project_id: string; member: Member | null }>(
        `/invitations/${invitationId}/respond`,
        { method: "POST", body: JSON.stringify({ accept }) },
      ),
  },
};
