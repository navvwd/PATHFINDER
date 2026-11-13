/**
 * Typed PathFinder API client shared by the web and mobile apps.
 * All business rules live on the server; this client only transports data,
 * handles token refresh and normalises errors.
 */
import type * as T from "@pathfinder/shared-types";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown, public requestId?: string) {
    super(message);
  }
}

export type ClientMode = "web" | "mobile";

export interface ClientConfig {
  baseUrl: string; // e.g. http://localhost:8000/api/v1
  mode: ClientMode;
  getAccessToken: () => string | null;
  setAccessToken: (token: string | null) => void;
  /** mobile only: secure storage for the refresh token */
  getRefreshToken?: () => Promise<string | null>;
  setRefreshToken?: (token: string | null) => Promise<void>;
  onSessionExpired?: () => void;
  fetchImpl?: typeof fetch;
}

type Query = Record<string, string | number | boolean | null | undefined>;

function qs(q?: Query): string {
  if (!q) return "";
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
}

export class PathfinderApi {
  private refreshing: Promise<boolean> | null = null;
  constructor(private cfg: ClientConfig) {}

  private get f() {
    return this.cfg.fetchImpl ?? fetch.bind(globalThis);
  }

  async request<R>(method: string, path: string, opts: { body?: unknown; query?: Query; form?: FormData; auth?: boolean; retry?: boolean } = {}): Promise<R> {
    const headers: Record<string, string> = { Accept: "application/json", "X-Requested-With": "pathfinder" };
    const token = this.cfg.getAccessToken();
    if (token && opts.auth !== false) headers.Authorization = `Bearer ${token}`;
    let body: BodyInit | undefined;
    if (opts.form) body = opts.form;
    else if (opts.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(opts.body);
    }
    const res = await this.f(`${this.cfg.baseUrl}${path}${qs(opts.query)}`, {
      method, headers, body, credentials: this.cfg.mode === "web" ? "include" : "omit",
    });
    if (res.status === 401 && opts.retry !== false && opts.auth !== false && !path.startsWith("/auth/")) {
      if (await this.refresh()) return this.request<R>(method, path, { ...opts, retry: false });
      this.cfg.onSessionExpired?.();
    }
    if (res.status === 204) return undefined as R;
    const text = await res.text();
    const data = text ? JSON.parse(text) : undefined;
    if (!res.ok) {
      const e = (data as T.ApiErrorBody | undefined)?.error;
      throw new ApiError(res.status, e?.code ?? "http_error", e?.message ?? res.statusText, e?.details, e?.request_id);
    }
    return data as R;
  }

  /** Single-flight refresh: concurrent 401s share one refresh call. */
  async refresh(): Promise<boolean> {
    if (!this.refreshing) {
      this.refreshing = (async () => {
        try {
          const rt = this.cfg.mode === "mobile" ? await this.cfg.getRefreshToken?.() : undefined;
          if (this.cfg.mode === "mobile" && !rt) return false;
          const pair = await this.request<T.TokenPair>("POST", "/auth/refresh", {
            body: rt ? { refresh_token: rt } : undefined, auth: false, retry: false,
          });
          await this.storeTokens(pair);
          return true;
        } catch {
          this.cfg.setAccessToken(null);
          await this.cfg.setRefreshToken?.(null);
          return false;
        } finally {
          setTimeout(() => (this.refreshing = null), 0);
        }
      })();
    }
    return this.refreshing;
  }

  private async storeTokens(pair: T.TokenPair) {
    this.cfg.setAccessToken(pair.access_token);
    if (pair.refresh_token) await this.cfg.setRefreshToken?.(pair.refresh_token);
  }

  private get = <R>(path: string, query?: Query) => this.request<R>("GET", path, { query });
  private post = <R>(path: string, body?: unknown, query?: Query) => this.request<R>("POST", path, { body, query });
  private put = <R>(path: string, body?: unknown) => this.request<R>("PUT", path, { body });
  private patch = <R>(path: string, body?: unknown) => this.request<R>("PATCH", path, { body });
  private del = <R>(path: string) => this.request<R>("DELETE", path);

  // ------------------------------------------------------------------ auth
  auth = {
    login: async (identifier: string, password: string) => {
      const pair = await this.request<T.TokenPair>("POST", "/auth/login", { body: { identifier, password, client: this.cfg.mode }, auth: false });
      await this.storeTokens(pair);
      return pair;
    },
    registerStudent: async (body: { full_name: string; email?: string; phone?: string; password: string; date_of_birth: string; institution_code?: string }) => {
      const pair = await this.request<T.TokenPair>("POST", "/auth/register/student", { body, auth: false });
      await this.storeTokens(pair);
      return pair;
    },
    registerGuardian: async (body: { full_name: string; email?: string; phone?: string; password: string; student_invite_code?: string }) => {
      const pair = await this.request<T.TokenPair>("POST", "/auth/register/guardian", { body, auth: false });
      await this.storeTokens(pair);
      return pair;
    },
    logout: async () => {
      const rt = this.cfg.mode === "mobile" ? await this.cfg.getRefreshToken?.() : undefined;
      try { await this.request("POST", "/auth/logout", { body: rt ? { refresh_token: rt } : undefined, auth: false }); } finally {
        this.cfg.setAccessToken(null);
        await this.cfg.setRefreshToken?.(null);
      }
    },
    logoutAll: () => this.post<{ message: string }>("/auth/logout-all"),
    me: () => this.get<T.Me>("/auth/me"),
    forgot: (identifier: string) => this.request<{ message: string; debug_reset_token?: string }>("POST", "/auth/password/forgot", { body: { identifier }, auth: false }),
    reset: (token: string, new_password: string) => this.request<{ message: string }>("POST", "/auth/password/reset", { body: { token, new_password }, auth: false }),
    changePassword: (current_password: string, new_password: string) => this.post<{ message: string }>("/auth/password/change", { current_password, new_password }),
    sessions: () => this.get<Array<{ id: string; client: string; user_agent: string | null; created_at: string; last_used_at: string | null }>>("/auth/sessions"),
    revokeSession: (id: string) => this.del<{ message: string }>(`/auth/sessions/${id}`),
  };

  // ------------------------------------------------------------------ students
  students = {
    list: (q?: Query) => this.get<T.Page<T.StudentSummary>>("/students", q),
    me: () => this.get<T.StudentOut>("/students/me"),
    get: (id: string) => this.get<T.StudentOut>(`/students/${id}`),
    updateMe: (body: Partial<T.StudentOut> & { full_name?: string }) => this.patch<T.StudentOut>("/students/me", body),
    onboarding: () => this.get<T.OnboardingStatus>("/students/me/onboarding"),
    saveAcademic: (body: { school_name: string; grade: string; class_name?: string | null; educational_background?: string | null }) =>
      this.put<T.OnboardingStatus>("/students/me/onboarding/academic", body),
    saveInterests: (body: { favourite_subjects: string[]; hobbies: string[]; personal_interests: string[]; extracurriculars: string[];
      self_reported_strengths: string[]; domain_ids: string[]; subdomain_ids: string[]; favourite_domain_id?: string | null }) =>
      this.put<T.OnboardingStatus>("/students/me/onboarding/interests", body),
    saveGoals: (body: { skills_to_learn: string[]; activities_enjoyed: string[]; aspirations?: string | null; learning_preferences: string[] }) =>
      this.put<T.OnboardingStatus>("/students/me/onboarding/goals", body),
    guardianStep: (action: "invite" | "skip_adult") => this.put<T.OnboardingStatus>("/students/me/onboarding/guardian", { action }),
    completeOnboarding: () => this.post<T.OnboardingStatus>("/students/me/onboarding/complete"),
    newInviteCode: () => this.post<T.OnboardingStatus>("/students/me/guardian-invite"),
    dashboard: (studentId?: string) => this.get<T.Dashboard>(studentId ? `/students/${studentId}/dashboard` : "/students/me/dashboard"),
  };

  // ------------------------------------------------------------------ domains & interests
  domains = {
    list: () => this.get<T.Domain[]>("/domains"),
    get: (ref: string) => this.get<T.DomainDetail>(`/domains/${ref}`),
    subdomain: (id: string) => this.get<{ subdomain: T.Subdomain; domain: { id: string; name: string; slug: string; color: string }; activities: T.Activity[]; resources: T.Resource[] }>(`/subdomains/${id}`),
    create: (body: unknown) => this.post<T.Domain>("/domains", body),
    update: (id: string, body: unknown) => this.patch<T.Domain>(`/domains/${id}`, body),
    remove: (id: string) => this.del<{ message: string }>(`/domains/${id}`),
    createSubdomain: (body: unknown) => this.post<T.Subdomain>("/subdomains", body),
    updateSubdomain: (id: string, body: unknown) => this.patch<T.Subdomain>(`/subdomains/${id}`, body),
  };

  interests = {
    list: (studentId?: string) => this.get<T.Interest[]>("/interests", { student_id: studentId }),
    update: (selections: Array<{ domain_id: string; subdomain_id?: string | null; strength: number; is_favourite?: boolean }>) =>
      this.put<T.Interest[]>("/interests/me", { selections, source: "self" }),
    explore: (domain_id: string, subdomain_id?: string) => this.post<void>("/interests/me/explore", { domain_id, subdomain_id }),
    questionnaire: () => this.get<{ version: string; questions: Array<{ id: string; prompt: string; multi: boolean; options: Array<{ id: string; label: string }> }> }>("/interests/questionnaire"),
    submitQuestionnaire: (answers: Array<{ question_id: string; option_ids: string[] }>) =>
      this.post<{ suggestions: Array<{ domain_id: string; slug: string; votes: number; suggested_strength: number }>; note: string }>("/interests/questionnaire", { answers }),
    evolution: (studentId?: string) => this.get<{ initial_domain_ids: string[]; current: Array<{ domain_id: string; subdomain_id: string | null; strength: number; is_favourite: boolean }>;
      change_count: number; new_discoveries: Array<{ domain_id: string; at: string }>; timeline: T.InterestHistoryItem[] }>("/interests/evolution", { student_id: studentId }),
  };

  // ------------------------------------------------------------------ activities
  activities = {
    list: (q?: Query) => this.get<T.Page<T.Activity>>("/activities", q),
    featured: (limit = 6) => this.request<FeaturedActivity[]>("GET", "/activities/featured", { query: { limit }, auth: false }),
    get: (id: string) => this.get<T.Activity>(`/activities/${id}`),
    mine: (status?: string) => this.get<T.Assignment[]>("/activities/assigned/me", { status }),
    create: (body: unknown) => this.post<T.Activity>("/activities", body),
    update: (id: string, body: unknown) => this.patch<T.Activity>(`/activities/${id}`, body),
    archive: (id: string) => this.del<{ message: string }>(`/activities/${id}`),
    assign: (id: string, body: { student_ids?: string[]; batch_id?: string | null; due_at?: string | null; note?: string | null }) =>
      this.post<T.Assignment[]>(`/activities/${id}/assign`, body),
    rubrics: (domainId?: string) => this.get<T.Rubric[]>("/evaluations/rubrics", { domain_id: domainId }),
  };

  files = {
    upload: (file: Blob, name: string) => {
      const form = new FormData();
      form.append("file", file, name);
      return this.request<T.StoredFile>("POST", "/files", { form });
    },
    url: (id: string) => `${this.cfg.baseUrl}/files/${id}`,
    download: async (id: string) => {
      const res = await this.f(`${this.cfg.baseUrl}/files/${id}`, { headers: { Authorization: `Bearer ${this.cfg.getAccessToken() ?? ""}` } });
      if (!res.ok) throw new ApiError(res.status, "download_failed", "Could not download file");
      return res.blob();
    },
  };

  submissions = {
    create: (body: { activity_id: string; content_text?: string; link_url?: string; file_ids?: string[]; reflection?: string; self_rating?: number }) =>
      this.post<T.Submission>("/submissions", body),
    list: (q?: Query) => this.get<T.Page<T.Submission>>("/submissions", q),
    get: (id: string) => this.get<T.Submission>(`/submissions/${id}`),
    toPortfolio: (id: string) => this.post<{ message: string }>(`/submissions/${id}/portfolio`),
    evaluate: (id: string, body: { criteria_scores?: Record<string, number>; total_score?: number; feedback?: string; evidence_quality?: number; mentor_validated?: boolean; return_for_revision?: boolean }) =>
      this.post<T.Evaluation>(`/evaluations/submissions/${id}`, body),
  };

  // ------------------------------------------------------------------ assessments
  assessments = {
    list: (q?: Query) => this.get<T.Page<T.Assessment>>("/assessments", q),
    get: (id: string) => this.get<T.Assessment | T.AssessmentManage>(`/assessments/${id}`),
    create: (body: unknown) => this.post<T.AssessmentManage>("/assessments", body),
    start: (id: string) => this.post<T.Attempt>(`/assessments/${id}/attempts`),
    save: (attemptId: string, answers: Array<{ question_id: string; answer: unknown }>) => this.put<T.Attempt>(`/assessments/attempts/${attemptId}/responses`, { answers }),
    submit: (attemptId: string, answers: Array<{ question_id: string; answer: unknown }>) => this.post<T.Attempt>(`/assessments/attempts/${attemptId}/submit`, { answers }),
    attempts: (q?: Query) => this.get<T.Attempt[]>("/assessments/attempts", q),
    attempt: (id: string) => this.get<T.Attempt>(`/assessments/attempts/${id}`),
    pendingReview: () => this.get<T.Attempt[]>("/assessments/attempts/pending-review"),
    evaluate: (attemptId: string, body: { response_points: Record<string, number>; feedback?: string }) => this.post<T.Evaluation>(`/evaluations/attempts/${attemptId}`, body),
  };

  // ------------------------------------------------------------------ progress & analytics
  progress = {
    summary: (studentId?: string) => this.get<T.ProgressSummary>("/progress/summary", { student_id: studentId }),
    timeline: (q: { student_id?: string; period?: "daily" | "weekly" | "monthly"; domain_id?: string; days?: number }) => this.get<T.TimelinePoint[]>("/progress/timeline", q),
    events: (q?: Query) => this.get<T.Page<T.ProgressEvent>>("/progress/events", q),
    reflect: (body: { text: string; domain_id?: string; mood?: string }) => this.post<T.ProgressEvent>("/progress/reflections", body),
    goals: (studentId?: string) => this.get<T.WeeklyGoal[]>("/progress/goals", { student_id: studentId }),
    addGoal: (body: { title: string; kind: string; target_count: number }) => this.post<T.WeeklyGoal>("/progress/goals", body),
    updateGoal: (id: string, body: { title?: string; target_count?: number; increment?: number }) => this.patch<T.WeeklyGoal>(`/progress/goals/${id}`, body),
    snapshots: (studentId?: string, period = "weekly") => this.get<Array<{ period_start: string; metrics: Record<string, unknown> }>>("/progress/snapshots", { student_id: studentId, period }),
  };

  analytics = {
    domainScores: (studentId?: string) => this.get<T.DomainScore[]>("/analytics/domain-scores", { student_id: studentId }),
    history: (domainId: string, studentId?: string) => this.get<T.DomainScore[]>("/analytics/domain-scores/history", { domain_id: domainId, student_id: studentId }),
    recompute: (studentId?: string) => this.post<T.DomainScore[]>("/analytics/recompute", undefined, { student_id: studentId }),
    platform: () => this.get<Record<string, unknown>>("/analytics/platform"),
    scoringVersions: () => this.get<T.ScoringConfig[]>("/analytics/scoring-config"),
    activeScoring: () => this.get<T.ScoringConfig>("/analytics/scoring-config/active"),
    newScoring: (body: { weights: Record<string, number>; thresholds?: Record<string, number>; note?: string }) => this.post<T.ScoringConfig>("/analytics/scoring-config", body),
  };

  recommendations = {
    get: (studentId?: string) => this.get<T.RecommendationSet>("/recommendations", { student_id: studentId }),
    generate: (studentId?: string) => this.post<T.RecommendationSet>("/recommendations/generate", undefined, { student_id: studentId }),
    respond: (id: string, status: "accepted" | "dismissed" | "disagreed", response?: string) => this.post<T.Recommendation>(`/recommendations/${id}/respond`, { status, response }),
    review: (id: string, mentor_review_status: "approved" | "adjusted" | "rejected", mentor_note?: string) => this.post<T.Recommendation>(`/recommendations/${id}/review`, { mentor_review_status, mentor_note }),
  };

  ai = {
    status: () => this.get<{ llm_enabled: boolean; provider: string; model: string | null; notice: string }>("/ai/status"),
    chat: (message: string, studentId?: string) => this.post<T.AIResponse<{ reply: string; suggested_activity_ids: string[]; suggested_activities: Array<{ id: string; title: string; domain: string; difficulty: number }> }>>("/ai/chat", { message, student_id: studentId }),
    summary: (studentId?: string) => this.post<T.AIResponse<{ headline: string; highlights: string[]; growth_areas: string[]; next_steps: string[] }>>("/ai/summary", { student_id: studentId }),
    projectIdeas: (domain_id: string, studentId?: string) => this.post<T.AIResponse<{ ideas: Array<{ title: string; description: string; steps: string[]; skills_practised: string[]; estimated_hours: number }> }>>("/ai/project-ideas", { domain_id, student_id: studentId }),
    interestAnalysis: (studentId?: string) => this.post<T.AIResponse<{ summary: string; aligned_interests: string[]; keep_exploring: string[]; worth_trying: string[] }>>("/ai/interest-analysis", { student_id: studentId }),
    skillSuggestions: (studentId?: string) => this.post<T.AIResponse<{ suggestions: string[] }>>("/ai/skill-suggestions", { student_id: studentId }),
    parentReport: (studentId?: string) => this.post<T.AIResponse<{ title: string; sections: Array<{ title: string; body: string }> }>>("/ai/parent-report", { student_id: studentId }),
    mentorInsights: (studentId: string) => this.post<T.AIResponse<{ observations: string[]; suggested_focus: string[]; questions_to_ask: string[]; data_gaps: string[] }>>("/ai/mentor-insights", { student_id: studentId }),
  };

  // ------------------------------------------------------------------ growth
  roadmaps = {
    list: (studentId?: string) => this.get<T.Roadmap[]>("/roadmaps", { student_id: studentId }),
    get: (id: string) => this.get<T.Roadmap>(`/roadmaps/${id}`),
    generate: (horizon_days: 7 | 30 | 90 | 180, domain_ids: string[] = [], student_id?: string) => this.post<T.Roadmap>("/roadmaps/generate", { horizon_days, domain_ids, student_id }),
    update: (id: string, body: { title?: string; objectives?: string[]; status?: string }) => this.patch<T.Roadmap>(`/roadmaps/${id}`, body),
    archive: (id: string) => this.del<{ message: string }>(`/roadmaps/${id}`),
    addMilestone: (id: string, body: { title: string; description?: string; due_day: number; resource_url?: string }) => this.post<T.Roadmap>(`/roadmaps/${id}/milestones`, body),
    updateMilestone: (id: string, body: { status?: string; title?: string; due_day?: number; description?: string }) => this.patch<T.Roadmap>(`/roadmaps/milestones/${id}`, body),
    deleteMilestone: (id: string) => this.del<T.Roadmap>(`/roadmaps/milestones/${id}`),
    review: (id: string, mentor_review_status: string, mentor_note?: string) => this.post<T.Roadmap>(`/roadmaps/${id}/review`, { mentor_review_status, mentor_note }),
  };

  portfolios = {
    get: (studentId?: string) => this.get<T.Portfolio>("/portfolios", { student_id: studentId }),
    update: (body: { title?: string; bio?: string; visibility?: string }) => this.patch<T.Portfolio>("/portfolios/me", body),
    addItem: (body: { title: string; description?: string; category: string; domain_ids?: string[]; file_id?: string; external_url?: string; created_on?: string; is_featured?: boolean }) =>
      this.post<T.PortfolioItem>("/portfolios/me/items", body),
    updateItem: (id: string, body: { title?: string; description?: string; is_featured?: boolean; category?: string }) => this.patch<T.PortfolioItem>(`/portfolios/me/items/${id}`, body),
    deleteItem: (id: string) => this.del<{ message: string }>(`/portfolios/me/items/${id}`),
    exportData: (studentId?: string) => this.get<Record<string, unknown>>("/portfolios/export", { student_id: studentId }),
    shared: (token: string) => this.request<T.Portfolio>("GET", `/portfolios/shared/${token}`, { auth: false }),
    guardianApproval: (studentId: string, approved: boolean) => this.post<T.Portfolio>(`/portfolios/${studentId}/guardian-approval`, undefined, { approved }),
  };

  achievements = { get: (studentId?: string) => this.get<T.Gamification>("/achievements", { student_id: studentId }) };

  notifications = {
    list: (q?: Query) => this.get<T.Page<T.Notification>>("/notifications", q),
    unread: () => this.get<{ count: number }>("/notifications/unread-count"),
    read: (id: string) => this.post<T.Notification>(`/notifications/${id}/read`),
    readAll: () => this.post<{ message: string }>("/notifications/read-all"),
    prefs: () => this.get<T.NotificationPrefs>("/notifications/preferences"),
    setPrefs: (p: T.NotificationPrefs) => this.put<T.NotificationPrefs>("/notifications/preferences", p),
    broadcast: (body: { title: string; body: string; roles?: string[]; institution_id?: string }) => this.post<{ message: string }>("/notifications/broadcast", body),
  };

  messages = {
    list: (studentId: string) => this.get<T.MessageOut[]>("/messages", { student_id: studentId }),
    contacts: (studentId: string) => this.get<Array<{ user_id: string; name: string; role: string }>>("/messages/contacts", { student_id: studentId }),
    send: (student_id: string, recipient_id: string, body: string) => this.post<T.MessageOut>("/messages", { student_id, recipient_id, body }),
  };

  // ------------------------------------------------------------------ people
  guardians = {
    children: () => this.get<Array<T.StudentSummary & { relationship: string; consent_status: string }>>("/guardians/me/children"),
    link: (invite_code: string, relationship = "parent") => this.post<T.StudentSummary>("/guardians/me/children", { invite_code, relationship }),
    overview: (studentId: string) => this.get<GuardianOverview>(`/guardians/children/${studentId}/overview`),
    consents: (studentId: string) => this.get<{ current: Record<string, { granted: boolean; at: string | null }>; history: Array<{ type: string; granted: boolean; at: string }> }>(`/guardians/children/${studentId}/consents`),
    setConsent: (studentId: string, consent_type: string, granted: boolean) => this.post<{ consent_status: string }>(`/guardians/children/${studentId}/consents`, { consent_type, granted }),
  };

  mentors = {
    students: () => this.get<Array<T.StudentSummary & { pending_reviews: number }>>("/mentors/me/students"),
    batches: () => this.get<Batch[]>("/mentors/me/batches"),
    createBatch: (body: { name: string; description?: string; student_ids?: string[]; domain_id?: string }) => this.post<Batch>("/mentors/me/batches", body),
    addMembers: (batchId: string, student_ids: string[]) => this.post<Batch>(`/mentors/me/batches/${batchId}/members`, { student_ids }),
    removeMember: (batchId: string, studentId: string) => this.del<Batch>(`/mentors/me/batches/${batchId}/members/${studentId}`),
    reviewQueue: () => this.get<ReviewQueue>("/mentors/me/review-queue"),
    feedback: (studentId: string) => this.get<T.MentorFeedback[]>(`/mentors/students/${studentId}/feedback`),
    addFeedback: (studentId: string, body: { content: string; kind: "feedback" | "observation"; domain_id?: string; visible_to_guardian?: boolean }) =>
      this.post<T.MentorFeedback>(`/mentors/students/${studentId}/feedback`, body),
  };

  institutions = {
    list: (q?: Query) => this.get<T.Page<Institution>>("/institutions", q),
    me: () => this.get<Institution>("/institutions/me"),
    get: (id: string) => this.get<Institution>(`/institutions/${id}`),
    create: (body: { name: string; code: string; kind?: string; contact_email?: string }) => this.post<Institution>("/institutions", body),
    register: (body: Record<string, string>) => this.request<{ id: string; status: string; message: string }>("POST", "/institutions/register", { body, auth: false }),
    update: (id: string, body: Record<string, unknown>) => this.patch<Institution>(`/institutions/${id}`, body),
    campuses: (id: string) => this.get<Array<{ id: string; name: string; address: string | null }>>(`/institutions/${id}/campuses`),
    addCampus: (id: string, body: { name: string; address?: string }) => this.post<{ id: string }>(`/institutions/${id}/campuses`, body),
    years: (id: string) => this.get<Array<{ id: string; label: string; starts_on: string; ends_on: string; is_current: boolean }>>(`/institutions/${id}/academic-years`),
    addYear: (id: string, body: { label: string; starts_on: string; ends_on: string; is_current: boolean }) => this.post<{ id: string }>(`/institutions/${id}/academic-years`, body),
    classes: (id: string) => this.get<Array<{ id: string; name: string; grade: string; section: string | null; students: number }>>(`/institutions/${id}/classes`),
    addClass: (id: string, body: { name: string; grade: string; section?: string }) => this.post<{ id: string }>(`/institutions/${id}/classes`, body),
    importStudents: (id: string, file: Blob, classId?: string) => {
      const form = new FormData();
      form.append("file", file, "students.csv");
      return this.request<{ created: Array<{ row: number; full_name: string; email: string; temporary_password: string }>; errors: Array<{ row: number; error: string }>; note: string }>(
        "POST", `/institutions/${id}/students/import`, { form, query: { class_id: classId } });
    },
    staff: (id: string) => this.get<Array<{ mentor_id: string; user_id: string; full_name: string; email: string; role: string; kind: string; students: number; is_active: boolean }>>(`/institutions/${id}/staff`),
    addStaff: (id: string, body: { full_name: string; email: string; password: string; role: string }) => this.post<{ mentor_id: string }>(`/institutions/${id}/staff`, body),
    allocate: (id: string, body: { mentor_id: string; student_ids: string[]; batch_name: string }) => this.post<{ batch_id: string; students: number }>(`/institutions/${id}/mentor-allocations`, body),
    distribute: (id: string, body: { activity_id: string; class_id: string; due_at?: string }) => this.post<{ assigned: number }>(`/institutions/${id}/activity-distribution`, body),
    analytics: (id: string) => this.get<InstitutionAnalytics>(`/institutions/${id}/analytics`),
    subscription: (id: string) => this.get<Record<string, unknown>>(`/institutions/${id}/subscription`),
    setSubscription: (id: string, body: { plan_code: string; seats: number; status?: string }) => this.put<Record<string, unknown>>(`/institutions/${id}/subscription`, body),
  };

  reports = {
    list: (q?: Query) => this.get<T.Page<T.Report>>("/reports", q),
    get: (id: string) => this.get<T.Report>(`/reports/${id}`),
    generate: (kind: "weekly" | "monthly" | "progress" | "parent", studentId?: string) => this.post<T.Report>("/reports/generate", { kind, student_id: studentId }),
    institution: (instId: string) => this.post<T.Report>(`/reports/institution/${instId}`),
  };

  contact = (body: { name: string; email: string; topic: string; message: string }) =>
    this.request<{ message: string }>("POST", "/contact", { body, auth: false });

  // ------------------------------------------------------------------ admin
  users = {
    list: (q?: Query) => this.get<T.Page<T.UserOut>>("/users", q),
    create: (body: { full_name: string; email: string; password: string; role: string; institution_id?: string }) => this.post<T.UserOut>("/users", body),
    update: (id: string, body: { full_name?: string; is_active?: boolean; role?: string }) => this.patch<T.UserOut>(`/users/${id}`, body),
    remove: (id: string) => this.del<{ message: string }>(`/users/${id}`),
    updateMe: (body: { full_name?: string; theme?: string }) => this.patch<T.UserOut>("/users/me", body),
    exportMe: () => this.get<Record<string, unknown>>("/users/me/export"),
    deleteMe: () => this.post<{ message: string }>("/users/me/delete", { confirm: "DELETE" }),
  };

  admin = {
    overview: () => this.get<Record<string, unknown>>("/admin/overview"),
    auditLogs: (q?: Query) => this.get<T.Page<AuditEntry>>("/admin/audit-logs", q),
    flags: () => this.get<Array<{ key: string; enabled: boolean; description: string | null }>>("/admin/feature-flags"),
    setFlag: (key: string, enabled: boolean, description?: string | null) => this.put<{ key: string; enabled: boolean }>(`/admin/feature-flags/${key}`, { enabled, description }),
    setting: (key: string) => this.get<{ key: string; value: Record<string, unknown> }>(`/admin/settings/${key}`),
    setSetting: (key: string, value: Record<string, unknown>) => this.put<{ key: string; value: Record<string, unknown> }>(`/admin/settings/${key}`, { value }),
    aiUsage: (days = 30) => this.get<{ days: number; rows: Array<{ feature: string; status: string; requests: number; input_tokens: number; output_tokens: number; avg_latency_ms: number }> }>("/admin/ai-usage", { days }),
    system: () => this.get<Record<string, unknown>>("/admin/system"),
    plans: () => this.get<Array<{ code: string; name: string; max_students: number; price_inr_per_year: number; is_active: boolean }>>("/admin/subscription-plans"),
    approveTenant: (id: string) => this.post<{ id: string; is_active: boolean }>(`/admin/tenants/${id}/approve`),
  };
}

export type FeaturedActivity = { id: string; title: string; domain: string; domain_slug: string; category: string; difficulty: number;
  estimated_minutes: number; min_age: number; max_age: number; skills: string[] };
export type Batch = { id: string; name: string; description: string | null; domain_id: string | null; student_count: number; students: T.StudentSummary[]; created_at: string };
export type ReviewQueue = {
  submissions: T.Submission[];
  attempts: Array<{ id: string; student_id: string; student_name: string | null; assessment_title: string; submitted_at: string | null }>;
  recommendations: Array<{ id: string; student_id: string; student_name: string | null; title: string; kind: string; status: string; reasons: string[]; student_response: string | null }>;
};
export type Institution = { id: string; name: string; code: string; kind: string; address: string | null; contact_email: string | null; is_active: boolean;
  created_at: string; students: number; staff: number; subscription: { plan_code: string; status: string; seats: number; ends_on: string | null } | null };
export type InstitutionAnalytics = { students: number; active_students_30d: number; note: string;
  domain_participation: Array<{ domain_id: string; domain: string; color: string; interested_students: number; participating_students: number; assessed_students: number; average_skill_score: number | null }> };
export type AuditEntry = { id: string; action: string; category: string; actor: string | null; entity_type: string | null; entity_id: string | null; ip_address: string | null; details: Record<string, unknown>; created_at: string };
export type GuardianOverview = {
  student: T.StudentSummary;
  interests: Array<{ domain_id: string; domain_name: string; strength: number; is_favourite: boolean }>;
  progress: T.ProgressSummary;
  recent_activity: Array<{ type: string; title: string | null; score_pct: number | null; domain_name: string | null; at: string }>;
  mentor_feedback: Array<{ content: string; mentor_name: string | null; at: string; domain_name: string | null }>;
  mentors: Array<{ user_id: string; name: string }>;
  recommendations: Array<{ title: string; kind: string; reasons: string[] }>;
  consent_status: string;
};

export const friendlyError = (e: unknown): string => {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message === "Failed to fetch" ? "Can't reach the server. Check your connection." : e.message;
  return "Something went wrong";
};
