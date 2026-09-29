export type TaskStatus = "todo" | "in_progress" | "done";
export type TaskPriority = "low" | "medium" | "high";

export interface User {
  id: string;
  name: string;
  email: string;
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  project_id: string;
  created_by: string;
  assignee_id: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  assignee_name?: string | null;
  assignee_email?: string | null;
  created_by_name?: string | null;
}

export interface Member {
  project_id: string;
  user_id: string;
  role: string;
  joined_at: string;
  name?: string | null;
  email?: string | null;
}

export interface ProjectInvitation {
  id: string;
  project_id: string;
  project_name: string;
  inviter_id: string;
  inviter_name?: string | null;
  inviter_email: string;
  invitee_id: string;
  invitee_name?: string | null;
  invitee_email: string;
  created_at: string;
}

export interface Comment {
  id: string;
  task_id: string;
  author_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  author_name?: string | null;
  author_email?: string | null;
}

export interface Activity {
  id: string;
  type: string;
  message: string;
  created_at: string;
}

export interface DashboardSummary {
  project_count: number;
  assigned_tasks: {
    todo: number;
    in_progress: number;
    done: number;
  };
  tasks_completed_this_week: number;
  project_with_most_open_tasks: string | null;
  recent_personal_activity: Activity[];
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
}

export interface ApiErrorShape {
  detail?: string;
  message?: string;
}

export interface ProjectCreateInput {
  name: string;
  description?: string;
  member_ids?: string[];
}

export interface TaskCreateInput {
  title: string;
  description?: string;
  assignee_id: string | null;
  priority: TaskPriority;
  due_date: string | null;
}

export interface TaskUpdateInput {
  title?: string;
  description?: string;
  assignee_id?: string | null;
  priority?: TaskPriority;
  due_date?: string | null;
}
