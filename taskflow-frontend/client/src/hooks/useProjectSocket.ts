import { useEffect, useRef } from "react";
import { getAccessToken } from "@/lib/api";
import type { Comment, Member, Task } from "@/lib/types";

export type ProjectSocketEvent =
  | { type: "task.created"; project_id: string; payload: Task }
  | { type: "task.updated"; project_id: string; payload: Task }
  | { type: "task.status_changed"; project_id: string; payload: Task }
  | { type: "task.deleted"; project_id: string; payload: { id: string } }
  | { type: "comment.created"; project_id: string; payload: { task_id: string; comment: Comment } }
  | { type: "member.added"; project_id: string; payload: Member }
  | { type: "member.removed"; project_id: string; payload: { user_id: string } };

function getWsBaseUrl() {
  const apiBase = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api/v1";
  const httpBase = apiBase.replace(/\/api\/v1\/?$/, "");
  return httpBase.replace(/^http/i, "ws");
}

export function useProjectSocket(
  projectId: string | undefined,
  onEvent: (event: ProjectSocketEvent) => void,
) {
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    if (!projectId) return;

    let socket: WebSocket | null = null;
    let closed = false;
    let reconnectTimer: number | undefined;
    let attempt = 0;

    const connect = () => {
      if (closed) return;
      const token = getAccessToken();
      if (!token) return;

      socket = new WebSocket(`${getWsBaseUrl()}/ws/projects/${projectId}?token=${encodeURIComponent(token)}`);

      socket.onopen = () => {
        attempt = 0;
      };

      socket.onmessage = (message) => {
        try {
          const event = JSON.parse(message.data) as ProjectSocketEvent;
          if (event?.type) handlerRef.current(event);
        } catch {
          // ignore malformed frames
        }
      };

      socket.onclose = () => {
        if (closed) return;
        const delay = Math.min(10000, 1000 * 2 ** attempt);
        attempt += 1;
        reconnectTimer = window.setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      closed = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [projectId]);
}
