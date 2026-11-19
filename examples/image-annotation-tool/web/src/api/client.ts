// Thin client for the API service. All calls go to /api, which nginx proxies to the api container.

export type Role = "admin" | "annotator" | "reviewer";
export type TaskStatus = "pending" | "in_progress" | "submitted" | "approved" | "rejected";

export interface Box {
  id?: number;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Task {
  id: number;
  status: TaskStatus;
  assignee_id: number | null;
  image: {
    id: number;
    filename: string;
    width: number | null;
    height: number | null;
    url: string; // presigned MinIO URL, fetched by the browser directly
    thumbnail_url: string | null;
  };
  annotations: Box[];
  last_review: { decision: "approved" | "rejected"; comment: string } | null;
}

export interface ExportJob {
  id: number;
  status: "queued" | "running" | "done" | "failed";
  task_count: number | null;
  download_url: string | null;
}

const TOKEN_KEY = "token";
const ROLE_KEY = "role";

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const isForm = body instanceof FormData;
  if (body !== undefined && !isForm) headers["Content-Type"] = "application/json";

  const response = await fetch(`/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${method} ${path} failed: ${response.status}`);
  return response.json() as Promise<T>;
}

// --- auth ---

export async function login(email: string, password: string): Promise<Role> {
  const result = await request<{ access_token: string; role: Role }>("POST", "/auth/login", { email, password });
  localStorage.setItem(TOKEN_KEY, result.access_token);
  localStorage.setItem(ROLE_KEY, result.role);
  return result.role;
}

export function logout(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(ROLE_KEY);
}

export function getRole(): Role | null {
  return localStorage.getItem(ROLE_KEY) as Role | null;
}

// --- annotator ---

/** Resumes the open task or claims the next pending one. Null when the queue is empty. */
export const claimNextTask = () => request<Task>("POST", "/tasks/next").catch(() => null);
export const listMyRejectedTasks = () => request<Task[]>("GET", "/tasks?status=rejected&mine=true");
export const saveAnnotations = (taskId: number, boxes: Box[]) =>
  request<Box[]>("PUT", `/tasks/${taskId}/annotations`, boxes);
export const submitTask = (taskId: number) => request<Task>("POST", `/tasks/${taskId}/submit`);
export const reopenTask = (taskId: number) => request<Task>("POST", `/tasks/${taskId}/reopen`);

// --- reviewer ---

export const getReviewQueue = () => request<Task[]>("GET", "/reviews/queue");
export const reviewTask = (taskId: number, decision: "approved" | "rejected", comment: string) =>
  request<Task>("POST", `/tasks/${taskId}/reviews`, { decision, comment });

// --- admin ---

export function uploadBatch(batchName: string, files: File[]) {
  const form = new FormData();
  form.append("batch_name", batchName);
  files.forEach((file) => form.append("files", file));
  return request<{ batch_name: string; image_ids: number[] }>("POST", "/images", form);
}

export const requestExport = () => request<ExportJob>("POST", "/exports");
export const getExport = (exportId: number) => request<ExportJob>("GET", `/exports/${exportId}`);
