import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router";
import { AppShell, RequireAuth } from "./components/layout";
import { PageSkeleton } from "./components/ui";

const P = (f: () => Promise<unknown>, name: string) =>
  lazy(async () => ({ default: ((await f()) as Record<string, React.ComponentType>)[name]! }));

// public
const Welcome = P(() => import("./pages/public/Welcome"), "Welcome");
const Login = P(() => import("./pages/public/Auth"), "Login");
const Register = P(() => import("./pages/public/Auth"), "Register");
const Forgot = P(() => import("./pages/public/Auth"), "ForgotPassword");
const Reset = P(() => import("./pages/public/Auth"), "ResetPassword");
const InstitutionSignup = P(() => import("./pages/public/Auth"), "InstitutionSignup");
const SharedPortfolio = P(() => import("./pages/public/SharedPortfolio"), "SharedPortfolio");
// student
const Onboarding = P(() => import("./pages/student/Onboarding"), "Onboarding");
const Dashboard = P(() => import("./pages/student/Dashboard"), "Dashboard");
const Domains = P(() => import("./pages/student/Domains"), "Domains");
const DomainDetail = P(() => import("./pages/student/Domains"), "DomainDetail");
const SubdomainDetail = P(() => import("./pages/student/Domains"), "SubdomainDetail");
const Interests = P(() => import("./pages/student/Interests"), "Interests");
const Activities = P(() => import("./pages/student/Activities"), "Activities");
const ActivityDetail = P(() => import("./pages/student/Activities"), "ActivityDetail");
const Assessments = P(() => import("./pages/student/Assessments"), "Assessments");
const TakeAssessment = P(() => import("./pages/student/Assessments"), "TakeAssessment");
const AttemptResult = P(() => import("./pages/student/Assessments"), "AttemptResult");
const Projects = P(() => import("./pages/student/Projects"), "Projects");
const Portfolio = P(() => import("./pages/student/Portfolio"), "Portfolio");
const Progress = P(() => import("./pages/student/Progress"), "Progress");
const Recommendations = P(() => import("./pages/student/Recommendations"), "Recommendations");
const Roadmaps = P(() => import("./pages/student/Roadmap"), "Roadmaps");
const RoadmapDetail = P(() => import("./pages/student/Roadmap"), "RoadmapDetail");
const Assistant = P(() => import("./pages/student/Assistant"), "Assistant");
const Achievements = P(() => import("./pages/student/Achievements"), "Achievements");
const Notifications = P(() => import("./pages/shared/Notifications"), "Notifications");
const SettingsPage = P(() => import("./pages/shared/Settings"), "Settings");
// guardian
const ParentHome = P(() => import("./pages/parent/Parent"), "ParentHome");
const ChildView = P(() => import("./pages/parent/Parent"), "ChildView");
const Messages = P(() => import("./pages/shared/Messages"), "Messages");
// mentor
const MentorHome = P(() => import("./pages/mentor/Mentor"), "MentorHome");
const MentorStudents = P(() => import("./pages/mentor/Mentor"), "MentorStudents");
const MentorStudent = P(() => import("./pages/mentor/MentorStudent"), "MentorStudent");
const ReviewQueue = P(() => import("./pages/mentor/Reviews"), "ReviewQueue");
const ReviewSubmission = P(() => import("./pages/mentor/Reviews"), "ReviewSubmission");
const ReviewAttempt = P(() => import("./pages/mentor/Reviews"), "ReviewAttempt");
const Batches = P(() => import("./pages/mentor/Mentor"), "Batches");
const ActivityManager = P(() => import("./pages/mentor/Content"), "ActivityManager");
const AssessmentBuilder = P(() => import("./pages/mentor/Content"), "AssessmentBuilder");
// institution
const InstitutionHome = P(() => import("./pages/institution/Institution"), "InstitutionHome");
const InstitutionStructure = P(() => import("./pages/institution/Institution"), "InstitutionStructure");
const InstitutionPeople = P(() => import("./pages/institution/Institution"), "InstitutionPeople");
const InstitutionReports = P(() => import("./pages/institution/Institution"), "InstitutionReports");
// admin
const AdminHome = P(() => import("./pages/admin/Admin"), "AdminHome");
const AdminUsers = P(() => import("./pages/admin/Admin"), "AdminUsers");
const AdminInstitutions = P(() => import("./pages/admin/Admin"), "AdminInstitutions");
const AdminDomains = P(() => import("./pages/admin/Admin"), "AdminDomains");
const AdminBroadcast = P(() => import("./pages/admin/Admin"), "AdminBroadcast");
const ScoringConfig = P(() => import("./pages/admin/SuperAdmin"), "ScoringConfig");
const AiSettings = P(() => import("./pages/admin/SuperAdmin"), "AiSettings");
const FeatureFlags = P(() => import("./pages/admin/SuperAdmin"), "FeatureFlags");
const Security = P(() => import("./pages/admin/SuperAdmin"), "Security");
const SystemMonitor = P(() => import("./pages/admin/SuperAdmin"), "SystemMonitor");

const STAFF = ["mentor", "teacher", "institution_admin", "platform_admin", "super_admin"];
const ADMINS = ["platform_admin", "super_admin"];

export function App() {
  return (
    <Suspense fallback={<div className="p-8"><PageSkeleton /></div>}>
      <Routes>
        <Route path="/" element={<Welcome />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<Forgot />} />
        <Route path="/reset-password" element={<Reset />} />
        <Route path="/institutions/register" element={<InstitutionSignup />} />
        <Route path="/p/:token" element={<SharedPortfolio />} />

        <Route element={<RequireAuth />}>
          <Route element={<AppShell />}>
            <Route element={<RequireAuth roles={["student"]} />}>
              <Route path="/app" element={<Dashboard />} />
              <Route path="/app/onboarding" element={<Onboarding />} />
              <Route path="/app/domains" element={<Domains />} />
              <Route path="/app/domains/:slug" element={<DomainDetail />} />
              <Route path="/app/subdomains/:id" element={<SubdomainDetail />} />
              <Route path="/app/interests" element={<Interests />} />
              <Route path="/app/activities" element={<Activities />} />
              <Route path="/app/activities/:id" element={<ActivityDetail />} />
              <Route path="/app/assessments" element={<Assessments />} />
              <Route path="/app/assessments/:id/take" element={<TakeAssessment />} />
              <Route path="/app/assessments/attempts/:id" element={<AttemptResult />} />
              <Route path="/app/projects" element={<Projects />} />
              <Route path="/app/portfolio" element={<Portfolio />} />
              <Route path="/app/progress" element={<Progress />} />
              <Route path="/app/recommendations" element={<Recommendations />} />
              <Route path="/app/roadmap" element={<Roadmaps />} />
              <Route path="/app/roadmap/:id" element={<RoadmapDetail />} />
              <Route path="/app/assistant" element={<Assistant />} />
              <Route path="/app/achievements" element={<Achievements />} />
              <Route path="/app/notifications" element={<Notifications />} />
              <Route path="/app/settings" element={<SettingsPage />} />
            </Route>
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/settings" element={<SettingsPage />} />

            <Route element={<RequireAuth roles={["guardian"]} />}>
              <Route path="/parent" element={<ParentHome />} />
              <Route path="/parent/children/:id" element={<ChildView />} />
              <Route path="/parent/messages" element={<Messages />} />
            </Route>

            <Route element={<RequireAuth roles={STAFF} />}>
              <Route path="/mentor" element={<MentorHome />} />
              <Route path="/mentor/students" element={<MentorStudents />} />
              <Route path="/mentor/students/:id" element={<MentorStudent />} />
              <Route path="/mentor/reviews" element={<ReviewQueue />} />
              <Route path="/mentor/reviews/:id" element={<ReviewSubmission />} />
              <Route path="/mentor/attempts/:id" element={<ReviewAttempt />} />
              <Route path="/mentor/batches" element={<Batches />} />
              <Route path="/mentor/activities" element={<ActivityManager />} />
              <Route path="/mentor/assessments" element={<AssessmentBuilder />} />
              <Route path="/mentor/messages" element={<Messages />} />
            </Route>

            <Route element={<RequireAuth roles={["institution_admin", ...ADMINS]} />}>
              <Route path="/institution" element={<InstitutionHome />} />
              <Route path="/institution/structure" element={<InstitutionStructure />} />
              <Route path="/institution/people" element={<InstitutionPeople />} />
              <Route path="/institution/reports" element={<InstitutionReports />} />
            </Route>

            <Route element={<RequireAuth roles={ADMINS} />}>
              <Route path="/admin" element={<AdminHome />} />
              <Route path="/admin/users" element={<AdminUsers />} />
              <Route path="/admin/institutions" element={<AdminInstitutions />} />
              <Route path="/admin/domains" element={<AdminDomains />} />
              <Route path="/admin/notifications" element={<AdminBroadcast />} />
            </Route>
            <Route element={<RequireAuth roles={["super_admin"]} />}>
              <Route path="/admin/scoring" element={<ScoringConfig />} />
              <Route path="/admin/ai" element={<AiSettings />} />
              <Route path="/admin/flags" element={<FeatureFlags />} />
              <Route path="/admin/security" element={<Security />} />
              <Route path="/admin/system" element={<SystemMonitor />} />
            </Route>
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
