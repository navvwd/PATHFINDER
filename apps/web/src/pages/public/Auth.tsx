import { zodResolver } from "@hookform/resolvers/zod";
import {
  guardianRegisterSchema, loginSchema, password as passwordRule, studentRegisterSchema,
  type GuardianRegisterInput, type LoginInput, type StudentRegisterInput,
} from "@pathfinder/validation";
import { friendlyError } from "@pathfinder/api-client";
import { CheckCircle2, GraduationCap, HeartHandshake } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router";
import { z } from "zod";
import { Button, Card, Field, Input, Tabs } from "@/components/ui";
import { api, homeFor, signIn, useAuth } from "@/lib/auth";
import { BrandMark } from "@/components/brand";

function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-full items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <Link to="/" aria-label="PathFinder AI home" className="mb-6 flex justify-center"><BrandMark size="lg" /></Link>
        <Card className="p-6 sm:p-8">
          <h1 className="text-2xl font-bold">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-subtle">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </Card>
      </div>
    </div>
  );
}

const FormError = ({ msg }: { msg: string | null }) => msg ? <div role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{msg}</div> : null;

export function Login() {
  const me = useAuth((s) => s.me);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [err, setErr] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });
  if (me) return <Navigate to={homeFor(me)} replace />;
  const onSubmit = async (v: LoginInput) => {
    setErr(null);
    try {
      const m = await signIn(v.identifier, v.password);
      const next = params.get("next");
      navigate(next && next.startsWith("/") && !next.startsWith("//") ? next : homeFor(m), { replace: true });
    } catch (e) { setErr(friendlyError(e)); }
  };
  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to continue your journey.">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <FormError msg={err} />
        <Field label="Email or mobile number" htmlFor="identifier" error={errors.identifier?.message}>
          <Input id="identifier" autoComplete="username" {...register("identifier")} invalid={!!errors.identifier} />
        </Field>
        <Field label="Password" htmlFor="password" error={errors.password?.message}>
          <Input id="password" type="password" autoComplete="current-password" {...register("password")} invalid={!!errors.password} />
        </Field>
        <div className="flex justify-end text-sm"><Link to="/forgot-password" className="text-primary hover:underline">Forgot password?</Link></div>
        <Button type="submit" className="w-full" size="lg" loading={isSubmitting}>Sign in</Button>
        <p className="text-center text-sm text-subtle">New here? <Link to="/register" className="text-primary hover:underline">Create an account</Link></p>
      </form>
    </AuthLayout>
  );
}

export function Register() {
  const [params] = useSearchParams();
  const [as, setAs] = useState<"student" | "guardian">(params.get("as") === "guardian" ? "guardian" : "student");
  const me = useAuth((s) => s.me);
  if (me) return <Navigate to={homeFor(me)} replace />;
  return (
    <AuthLayout title="Create your account" subtitle="Step 1 of onboarding - it takes about two minutes.">
      <Tabs value={as} onChange={setAs} tabs={[
        { key: "student", label: <span className="inline-flex items-center gap-1.5"><GraduationCap className="size-4" />Student</span> },
        { key: "guardian", label: <span className="inline-flex items-center gap-1.5"><HeartHandshake className="size-4" />Parent / Guardian</span> },
      ]} />
      <div className="mt-5">{as === "student" ? <StudentForm /> : <GuardianForm />}</div>
      <p className="mt-4 text-center text-sm text-subtle">Already have an account? <Link to="/login" className="text-primary hover:underline">Sign in</Link></p>
    </AuthLayout>
  );
}

async function finish(navigate: ReturnType<typeof useNavigate>) {
  const me = await api.auth.me();
  useAuth.getState().setMe(me);
  navigate(homeFor(me), { replace: true });
}

function StudentForm() {
  const navigate = useNavigate();
  const [err, setErr] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<StudentRegisterInput>({ resolver: zodResolver(studentRegisterSchema) });
  const onSubmit = async (v: StudentRegisterInput) => {
    setErr(null);
    try {
      await api.auth.registerStudent({ full_name: v.full_name, email: v.email || undefined, phone: v.phone || undefined,
        password: v.password, date_of_birth: v.date_of_birth, institution_code: v.institution_code || undefined });
      await finish(navigate);
    } catch (e) { setErr(friendlyError(e)); }
  };
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <FormError msg={err} />
      <Field label="Full name" htmlFor="full_name" error={errors.full_name?.message}><Input id="full_name" autoComplete="name" {...register("full_name")} /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Email" htmlFor="email" error={errors.email?.message}><Input id="email" type="email" autoComplete="email" {...register("email")} /></Field>
        <Field label="or Mobile" htmlFor="phone" error={errors.phone?.message}><Input id="phone" inputMode="tel" autoComplete="tel" {...register("phone")} /></Field>
      </div>
      <Field label="Date of birth" htmlFor="dob" error={errors.date_of_birth?.message} hint="Under 18? A parent or guardian will be asked to give consent.">
        <Input id="dob" type="date" {...register("date_of_birth")} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Password" htmlFor="pw" error={errors.password?.message}><Input id="pw" type="password" autoComplete="new-password" {...register("password")} /></Field>
        <Field label="Confirm password" htmlFor="pw2" error={errors.confirm_password?.message}><Input id="pw2" type="password" autoComplete="new-password" {...register("confirm_password")} /></Field>
      </div>
      <Field label="School code (optional)" htmlFor="code" hint="Ask your school if they use PathFinder."><Input id="code" {...register("institution_code")} /></Field>
      <Button type="submit" className="w-full" size="lg" loading={isSubmitting}>Create student account</Button>
    </form>
  );
}

function GuardianForm() {
  const navigate = useNavigate();
  const [err, setErr] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<GuardianRegisterInput>({ resolver: zodResolver(guardianRegisterSchema) });
  const onSubmit = async (v: GuardianRegisterInput) => {
    setErr(null);
    try {
      await api.auth.registerGuardian({ full_name: v.full_name, email: v.email || undefined, phone: v.phone || undefined,
        password: v.password, student_invite_code: v.student_invite_code || undefined });
      await finish(navigate);
    } catch (e) { setErr(friendlyError(e)); }
  };
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <FormError msg={err} />
      <Field label="Full name" htmlFor="g_name" error={errors.full_name?.message}><Input id="g_name" {...register("full_name")} /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Email" htmlFor="g_email" error={errors.email?.message}><Input id="g_email" type="email" {...register("email")} /></Field>
        <Field label="or Mobile" htmlFor="g_phone" error={errors.phone?.message}><Input id="g_phone" inputMode="tel" {...register("phone")} /></Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Password" htmlFor="g_pw" error={errors.password?.message}><Input id="g_pw" type="password" {...register("password")} /></Field>
        <Field label="Confirm password" htmlFor="g_pw2" error={errors.confirm_password?.message}><Input id="g_pw2" type="password" {...register("confirm_password")} /></Field>
      </div>
      <Field label="Child's invite code (optional)" htmlFor="g_code" hint="Your child sees this code during their onboarding. You can add children later too.">
        <Input id="g_code" className="uppercase" {...register("student_invite_code")} />
      </Field>
      <Button type="submit" className="w-full" size="lg" loading={isSubmitting}>Create guardian account</Button>
    </form>
  );
}

export function ForgotPassword() {
  const [sent, setSent] = useState<{ msg: string; token?: string } | null>(null);
  const { register, handleSubmit, formState: { isSubmitting } } = useForm<{ identifier: string }>();
  return (
    <AuthLayout title="Reset your password" subtitle="We'll send reset instructions to your email or phone.">
      {sent ? (
        <div className="space-y-4">
          <div className="flex gap-2 rounded-xl bg-success-soft p-3 text-sm text-success"><CheckCircle2 className="size-5 shrink-0" />{sent.msg}</div>
          {sent.token && (
            <p className="text-xs text-subtle">Development mode: email delivery is not configured, so the reset link is shown here.{" "}
              <Link className="text-primary underline" to={`/reset-password?token=${encodeURIComponent(sent.token)}`}>Open reset link</Link></p>
          )}
          <Link to="/login"><Button variant="secondary" className="w-full">Back to sign in</Button></Link>
        </div>
      ) : (
        <form className="space-y-4" onSubmit={handleSubmit(async (v) => {
          const r = await api.auth.forgot(v.identifier);
          setSent({ msg: r.message, token: r.debug_reset_token });
        })}>
          <Field label="Email or mobile number" htmlFor="fid"><Input id="fid" required {...register("identifier", { required: true })} /></Field>
          <Button type="submit" className="w-full" loading={isSubmitting}>Send instructions</Button>
        </form>
      )}
    </AuthLayout>
  );
}

const resetSchema = z.object({ password: passwordRule, confirm: z.string() }).refine((v) => v.password === v.confirm, { message: "Passwords don't match", path: ["confirm"] });

export function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [err, setErr] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<z.infer<typeof resetSchema>>({ resolver: zodResolver(resetSchema) });
  const token = params.get("token") ?? "";
  return (
    <AuthLayout title="Choose a new password">
      {!token ? <FormError msg="This reset link is missing its token." /> : (
        <form className="space-y-4" onSubmit={handleSubmit(async (v) => {
          try { await api.auth.reset(token, v.password); navigate("/login", { replace: true }); } catch (e) { setErr(friendlyError(e)); }
        })}>
          <FormError msg={err} />
          <Field label="New password" htmlFor="np" error={errors.password?.message}><Input id="np" type="password" {...register("password")} /></Field>
          <Field label="Confirm password" htmlFor="np2" error={errors.confirm?.message}><Input id="np2" type="password" {...register("confirm")} /></Field>
          <Button type="submit" className="w-full" loading={isSubmitting}>Update password</Button>
        </form>
      )}
    </AuthLayout>
  );
}

const instSchema = z.object({
  name: z.string().min(2), code: z.string().regex(/^[A-Za-z0-9-]{3,40}$/, "3-40 letters, digits or dashes"),
  contact_email: z.string().email(), admin_name: z.string().min(2), admin_email: z.string().email(), admin_password: passwordRule,
});

export function InstitutionSignup() {
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<z.infer<typeof instSchema>>({ resolver: zodResolver(instSchema) });
  return (
    <AuthLayout title="Register your institution" subtitle="Your institution is activated after a quick review by our team.">
      {done ? <div className="rounded-xl bg-success-soft p-4 text-sm text-success">{done}</div> : (
        <form className="space-y-4" onSubmit={handleSubmit(async (v) => {
          try { setDone((await api.institutions.register({ ...v, kind: "school" })).message); } catch (e) { setErr(friendlyError(e)); }
        })}>
          <FormError msg={err} />
          <Field label="Institution name" htmlFor="i_n" error={errors.name?.message}><Input id="i_n" {...register("name")} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Short code" htmlFor="i_c" error={errors.code?.message} hint="Students use this to join"><Input id="i_c" className="uppercase" {...register("code")} /></Field>
            <Field label="Contact email" htmlFor="i_e" error={errors.contact_email?.message}><Input id="i_e" type="email" {...register("contact_email")} /></Field>
          </div>
          <Field label="Administrator name" htmlFor="i_an" error={errors.admin_name?.message}><Input id="i_an" {...register("admin_name")} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Administrator email" htmlFor="i_ae" error={errors.admin_email?.message}><Input id="i_ae" type="email" {...register("admin_email")} /></Field>
            <Field label="Password" htmlFor="i_ap" error={errors.admin_password?.message}><Input id="i_ap" type="password" {...register("admin_password")} /></Field>
          </div>
          <Button type="submit" className="w-full" loading={isSubmitting}>Submit registration</Button>
        </form>
      )}
    </AuthLayout>
  );
}
