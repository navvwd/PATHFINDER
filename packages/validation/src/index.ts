/**
 * Client-side form validation shared by web and mobile. These mirror the
 * backend Pydantic rules for instant feedback; the server remains authoritative.
 */
import { z } from "zod";

const phone = z.string().regex(/^\+?[0-9]{10,15}$/, "Enter a valid mobile number (10-15 digits)");
export const password = z
  .string()
  .min(8, "At least 8 characters")
  .max(128)
  .regex(/[A-Za-z]/, "Include a letter")
  .regex(/[0-9]/, "Include a number");
const name = z.string().trim().min(2, "Please enter your name").max(150).regex(/^[\p{L}\p{M} .'-]+$/u, "Use letters only");

export const ageFromDob = (dob: string, today = new Date()): number => {
  const d = new Date(dob);
  let age = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--;
  return age;
};

export const loginSchema = z.object({
  identifier: z.string().trim().min(3, "Enter your email or mobile number"),
  password: z.string().min(1, "Enter your password"),
});

const contact = z.object({
  email: z.string().trim().email("Enter a valid email").optional().or(z.literal("")),
  phone: phone.optional().or(z.literal("")),
});

export const studentRegisterSchema = contact
  .extend({
    full_name: name,
    password,
    confirm_password: z.string(),
    date_of_birth: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Choose your date of birth")
      .refine((v) => { const a = ageFromDob(v); return a >= 5 && a <= 25; }, "PathFinder AI is for ages 6 to 21"),
    institution_code: z.string().trim().max(40).optional().or(z.literal("")),
  })
  .refine((v) => !!v.email || !!v.phone, { message: "Add an email or mobile number", path: ["email"] })
  .refine((v) => v.password === v.confirm_password, { message: "Passwords don't match", path: ["confirm_password"] });

export const guardianRegisterSchema = contact
  .extend({
    full_name: name,
    password,
    confirm_password: z.string(),
    student_invite_code: z.string().trim().max(16).optional().or(z.literal("")),
  })
  .refine((v) => !!v.email || !!v.phone, { message: "Add an email or mobile number", path: ["email"] })
  .refine((v) => v.password === v.confirm_password, { message: "Passwords don't match", path: ["confirm_password"] });

export const academicSchema = z.object({
  school_name: z.string().trim().min(1, "Enter your school").max(200),
  grade: z.string().trim().min(1, "Enter your grade").max(20),
  class_name: z.string().trim().max(50).optional(),
  educational_background: z.string().trim().max(1000).optional(),
});

export const goalsSchema = z.object({
  skills_to_learn: z.array(z.string()).max(20),
  activities_enjoyed: z.array(z.string()).max(20),
  aspirations: z.string().max(1000).optional(),
  learning_preferences: z.array(z.string()).max(20),
});

export const submissionSchema = z.object({
  content_text: z.string().max(20000).optional(),
  link_url: z.string().url("Enter a full link starting with https://").optional().or(z.literal("")),
  reflection: z.string().max(3000).optional(),
  self_rating: z.number().int().min(1).max(5).optional(),
});

export const activitySchema = z.object({
  title: z.string().trim().min(3).max(200),
  domain_id: z.string().uuid("Choose a domain"),
  subdomain_id: z.string().uuid().optional().or(z.literal("")),
  category: z.enum(["knowledge_quiz", "logical_puzzle", "creative_assignment", "coding_challenge", "science_experiment",
    "business_simulation", "public_speaking", "research_task", "practical_project", "team_challenge"]),
  description: z.string().trim().min(10).max(5000),
  instructions: z.string().trim().min(5).max(10000),
  difficulty: z.coerce.number().int().min(1).max(5),
  min_age: z.coerce.number().int().min(5).max(25),
  max_age: z.coerce.number().int().min(5).max(25),
  estimated_minutes: z.coerce.number().int().min(5).max(600),
  submission_type: z.enum(["text", "file", "link", "mixed", "none"]),
  max_score: z.coerce.number().positive().max(1000),
  xp_reward: z.coerce.number().int().min(0).max(500),
  rubric_id: z.string().uuid().optional().or(z.literal("")),
  status: z.enum(["draft", "published", "archived"]),
}).refine((v) => v.min_age <= v.max_age, { message: "Min age must be <= max age", path: ["max_age"] });

export const feedbackSchema = z.object({
  content: z.string().trim().min(2, "Write some feedback").max(5000),
  kind: z.enum(["feedback", "observation"]),
  visible_to_guardian: z.boolean(),
});

export const scoringWeightsSchema = z
  .record(z.string(), z.number().min(0).max(1))
  .refine((w) => Math.abs(Object.values(w).reduce((a, b) => a + b, 0) - 1) < 1e-6, "Weights must add up to 100%");

export type LoginInput = z.infer<typeof loginSchema>;
export type StudentRegisterInput = z.infer<typeof studentRegisterSchema>;
export type GuardianRegisterInput = z.infer<typeof guardianRegisterSchema>;
export type AcademicInput = z.infer<typeof academicSchema>;
export type ActivityInput = z.infer<typeof activitySchema>;
export type FeedbackInput = z.infer<typeof feedbackSchema>;
