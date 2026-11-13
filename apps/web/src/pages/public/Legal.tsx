import { zodResolver } from "@hookform/resolvers/zod";
import { friendlyError } from "@pathfinder/api-client";
import { CheckCircle2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { api } from "@/lib/auth";
import { Footer } from "./landing/Sections";
import { Nav } from "./landing/Nav";

function Page({ title, updated, children }: { title: string; updated?: string; children: ReactNode }) {
  return (
    <div className="min-h-full bg-bg">
      <Nav />
      <main className="mx-auto max-w-3xl px-4 pb-16 pt-32 sm:px-6">
        <h1 className="font-display text-5xl font-medium tracking-[-0.04em] text-ink">{title}</h1>
        {updated && <p className="mt-3 text-sm text-subtle">Last updated {updated}</p>}
        <div className="prose-pf mt-10 space-y-6 text-[15px] leading-relaxed text-subtle [&_h2]:mt-10 [&_h2]:font-display [&_h2]:text-2xl [&_h2]:text-ink [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-ink">{children}</div>
      </main>
      <Footer />
    </div>
  );
}

export function Privacy() {
  return (
    <Page title="Privacy Policy" updated="14 November 2026">
      <p>PathFinder AI is operated by Edutainal Ventures. This notice explains what we collect, why, and the choices you have. It reflects how the platform is built today and is pending formal legal review under India's Digital Personal Data Protection Act, 2023.</p>
      <h2>What we collect</h2>
      <ul>
        <li><strong>Account details:</strong> name, email or mobile number, date of birth (to choose age-appropriate activities and decide whether guardian consent is needed).</li>
        <li><strong>Learning records:</strong> interests you choose, activity submissions, assessment answers, mentor feedback, reflections and portfolio items.</li>
        <li><strong>Technical records:</strong> sign-in sessions, security logs and audit trails needed to keep accounts safe.</li>
      </ul>
      <p>We do not collect or analyse faces, voices or other biometric data, and we never infer intelligence, personality, emotions or health.</p>
      <h2>Children and guardian consent</h2>
      <p>Students under 18 need a verified parent or guardian to grant consent. Guardians can grant or withdraw consent for data processing, AI-assisted guidance, mentor access, communications and portfolio sharing at any time; every change is recorded.</p>
      <h2>How AI is used</h2>
      <p>AI guidance only receives a first name, age band and recorded learning activity - never contact details. For under-18s it runs only with guardian AI consent. Output is always labelled, and a rule-based engine is used when AI is unavailable. Student data is never used to train unrelated AI models.</p>
      <h2>Who can see your data</h2>
      <p>Portfolios are private by default. Guardians see linked children only; mentors and teachers see students assigned to them; institution administrators see their own institution. Students are never publicly ranked.</p>
      <h2>Your rights</h2>
      <ul>
        <li>Download all your data from Profile &amp; Settings.</li>
        <li>Delete your account at any time. Identifiers are removed immediately and remaining records are purged after 30 days.</li>
        <li>Ask questions or make a request through the <a className="text-primary-ink underline" href="/contact">contact page</a>.</li>
      </ul>
    </Page>
  );
}

export function Terms() {
  return (
    <Page title="Terms and Conditions" updated="14 November 2026">
      <p>These terms govern use of PathFinder AI, operated by Edutainal Ventures. They are a working draft pending legal review.</p>
      <h2>Using PathFinder</h2>
      <ul>
        <li>Students under 18 may use PathFinder with the consent of a parent or guardian.</li>
        <li>Keep your sign-in details private and tell us if you suspect misuse.</li>
        <li>Submit only work that is your own or that you have permission to share.</li>
      </ul>
      <h2>Scores and guidance</h2>
      <p>Scores describe recorded activities only. They are not intelligence tests, diagnoses or predictions, and recommendations - including AI-assisted ones - are suggestions you are free to disagree with.</p>
      <h2>Content and conduct</h2>
      <p>Be respectful in submissions, feedback and messages. Mentors and administrators may return, hide or remove content that is unsafe or inappropriate.</p>
      <h2>Institutions</h2>
      <p>Schools and organisations that register an institution are responsible for the accounts they create and must have a lawful basis for importing student data.</p>
      <h2>Changes</h2>
      <p>We will update this page and notify users in the app before material changes take effect.</p>
    </Page>
  );
}

const contactSchema = z.object({
  name: z.string().trim().min(2, "Please enter your name"),
  email: z.string().trim().email("Enter a valid email"),
  topic: z.enum(["general", "school", "parent", "mentor", "privacy", "support"]),
  message: z.string().trim().min(10, "Tell us a little more (10+ characters)").max(3000),
});

export function Contact() {
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<z.infer<typeof contactSchema>>({ resolver: zodResolver(contactSchema), defaultValues: { topic: "general" } });
  return (
    <Page title="Contact">
      <p>Questions about PathFinder, bringing it to your school, or a privacy request? Send us a message and the team will reply by email.</p>
      {done ? (
        <div className="flex items-start gap-3 rounded-3xl bg-success-soft p-5 text-success"><CheckCircle2 className="size-5 shrink-0" />{done}</div>
      ) : (
        <form className="space-y-4 rounded-[28px] border border-line bg-surface p-6 text-ink" noValidate onSubmit={handleSubmit(async (v) => {
          setErr(null);
          try { setDone((await api.contact(v)).message); } catch (e) { setErr(friendlyError(e)); }
        })}>
          {err && <p role="alert" className="rounded-xl bg-danger-soft p-3 text-sm text-danger">{err}</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Your name" htmlFor="cn" error={errors.name?.message}><Input id="cn" {...register("name")} /></Field>
            <Field label="Email" htmlFor="ce" error={errors.email?.message}><Input id="ce" type="email" {...register("email")} /></Field>
          </div>
          <Field label="Topic" htmlFor="ct"><Select id="ct" {...register("topic")}>
            <option value="general">General question</option><option value="school">For schools</option><option value="parent">For parents</option>
            <option value="mentor">For mentors</option><option value="privacy">Privacy request</option><option value="support">Account support</option></Select></Field>
          <Field label="Message" htmlFor="cm" error={errors.message?.message}><Textarea id="cm" {...register("message")} /></Field>
          <Button type="submit" loading={isSubmitting}>Send message</Button>
        </form>
      )}
    </Page>
  );
}
