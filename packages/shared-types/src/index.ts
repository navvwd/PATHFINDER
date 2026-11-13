/**
 * Shared API types. `openapi.ts` is generated from the FastAPI schema (npm run gen:types);
 * the aliases below give friendly names to the schemas used by both clients.
 */
import type { components } from "./openapi";

type S = components["schemas"];

export type { components, paths } from "./openapi";

export type Page<T> = { items: T[]; total: number; page: number; page_size: number };
export type ApiErrorBody = { error: { code: string; message: string; details?: unknown; request_id?: string } };

export type TokenPair = S["TokenPair"];
export type Me = S["MeOut"];
export type UserOut = S["UserOut"];
export type StudentOut = S["StudentOut"];
export type StudentSummary = S["StudentSummary"];
export type OnboardingStatus = S["OnboardingStatus"];
export type Dashboard = S["DashboardOut"];
export type Domain = S["DomainOut"];
export type DomainDetail = S["DomainDetail"];
export type Subdomain = S["SubdomainOut"];
export type Resource = S["ResourceOut"];
export type Interest = S["InterestOut"];
export type InterestHistoryItem = {
  id: string; domain_id: string | null; subdomain_id: string | null; action: string;
  old_value: Record<string, unknown> | null; new_value: Record<string, unknown> | null; source: string; created_at: string;
};
export type Activity = S["ActivityOut"];
export type Assignment = S["AssignmentOut"];
export type Submission = S["SubmissionOut"];
export type Evaluation = S["EvaluationOut"];
export type Rubric = S["RubricOut"];
export type StoredFile = S["FileOut"];
export type Assessment = S["AssessmentOut"];
export type AssessmentManage = S["AssessmentManageOut"];
export type Attempt = S["AttemptOut"];
export type Question = S["QuestionOut"];
export type DomainScore = S["DomainScoreOut"];
export type ProgressEvent = S["ProgressEventOut"];
export type WeeklyGoal = S["WeeklyGoalOut"];
export type ScoringConfig = S["ScoringConfigOut"];
export type Recommendation = S["RecommendationOut"];
export type RecommendationSet = S["RecommendationSet"];
export type Roadmap = S["RoadmapOut"];
export type Milestone = S["MilestoneOut"];
export type Portfolio = S["PortfolioOut"];
export type PortfolioItem = S["PortfolioItemOut"];
export type Gamification = S["GamificationOut"];
export type Achievement = S["AchievementOut"];
export type Notification = S["NotificationOut"];
export type NotificationPrefs = S["NotificationPrefs"];
export type MessageOut = S["MessageOut"];
export type MentorFeedback = S["MentorFeedbackOut"];
export type Report = S["ReportOut"];

export type Role =
  | "student" | "guardian" | "teacher" | "mentor" | "institution_admin" | "platform_admin" | "super_admin";
export type UiMode = Me["ui_mode"];

export type ProgressDomain = {
  domain_id: string; domain_name: string; color: string; status: "unexplored" | "emerging" | "assessed";
  skill_score: number | null; progress_score: number | null; interest_score: number | null;
  confidence: number; confidence_label: string; evidence_count: number; initial_performance: number | null;
  current_performance: number | null; average_performance: number | null; improvement_points: number | null;
  trend_label: string; completion_rate: number | null;
};
export type ProgressSummary = {
  overall: {
    evidence_count: number; initial_performance: number | null; current_performance: number | null;
    average_performance: number | null; improvement_points: number | null; improvement_percentage: number | null;
    trend_per_30_days: number | null; trend_label: "improving" | "steady" | "declining" | "insufficient_data";
    comparable_groups: number; completion_rate: number | null; consistency: number | null; notes: string[];
  };
  domains: ProgressDomain[];
  notes: string[];
};
export type TimelinePoint = { period_start: string; count: number; average_score: number | null; actions: number };
export type AIResponse<T> = { source: "ai" | "engine"; label: string; provider: string; model: string | null; data: T; note?: string | null };
