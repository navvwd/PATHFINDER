import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router";
import { Button, Card, cx, EmptyState, Input, PageHeader, Select, useToast } from "@/components/ui";
import { api, useAuth } from "@/lib/auth";
import { relTime } from "@/lib/format";

/** Messaging, always in the context of one student: guardian <-> mentor and student <-> mentor. */
export function Messages() {
  const me = useAuth((s) => s.me)!;
  const [params, setParams] = useSearchParams();
  const guardian = me.user.role === "guardian";
  const student = me.user.role === "student";
  const students = useQuery({
    queryKey: ["msg-students", me.user.role],
    queryFn: async (): Promise<Array<{ id: string; full_name: string }>> => {
      if (student) { const s = await api.students.me(); return [{ id: s.id, full_name: me.user.full_name }]; }
      return guardian ? await api.guardians.children() : await api.mentors.students();
    },
  });
  const studentId = params.get("student") ?? students.data?.[0]?.id ?? "";
  const contacts = useQuery({ queryKey: ["contacts", studentId], enabled: !!studentId, queryFn: () => api.messages.contacts(studentId) });
  const [to, setTo] = useState("");
  const recipient = to || contacts.data?.[0]?.user_id || "";
  const thread = useQuery({ queryKey: ["messages", studentId], enabled: !!studentId, queryFn: () => api.messages.list(studentId), refetchInterval: 20000 });
  const [body, setBody] = useState("");
  const qc = useQueryClient();
  const toast = useToast();
  const send = useMutation({ mutationFn: () => api.messages.send(studentId, recipient, body), onSuccess: () => { setBody(""); qc.invalidateQueries({ queryKey: ["messages", studentId] }); }, onError: (e) => toast.error(e) });
  const msgs = thread.data?.filter((m) => !recipient || m.sender_id === recipient || m.recipient_id === recipient) ?? [];
  return (
    <>
      <PageHeader title="Messages" subtitle={student ? "Ask your mentor anything - they usually reply within a day" : guardian ? "Talk with your child's mentors" : "Talk with your students and their guardians"} />
      <div className={cx("mb-4 grid gap-3", !student && "sm:grid-cols-2")}>
        {!student && <Select aria-label="Student" value={studentId} onChange={(e) => { setParams({ student: e.target.value }); setTo(""); }}>
          {students.data?.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
        </Select>}
        <Select aria-label="Recipient" value={recipient} onChange={(e) => setTo(e.target.value)}>
          {contacts.data?.length ? contacts.data.map((c) => <option key={c.user_id} value={c.user_id}>{c.name} ({c.role === "student" ? "student" : c.role === "guardian" ? "guardian" : "mentor"})</option>) : <option value="">No contacts available</option>}
        </Select>
      </div>
      <Card className="flex h-[60vh] flex-col">
        <div className="flex-1 space-y-3 overflow-y-auto p-5">
          {!msgs.length && <EmptyState title="No messages yet" body={contacts.data?.length ? "Start the conversation below." : guardian || student ? "No mentor is assigned yet - your school will set this up." : "No contacts for this student yet."} />}
          {msgs.map((m) => {
            const mine = m.sender_id === me.user.id;
            return <div key={m.id} className={cx("flex", mine && "justify-end")}><div className={cx("max-w-[75%] rounded-2xl px-4 py-2 text-sm", mine ? "bg-inverse text-on-inverse" : "bg-muted")}>
              {!mine && <div className="text-xs font-semibold">{m.sender_name}</div>}<p className="whitespace-pre-line">{m.body}</p><div className="mt-1 text-[10px] opacity-70">{relTime(m.created_at)}</div></div></div>;
          })}
        </div>
        <form className="flex gap-2 border-t border-line p-3" onSubmit={(e) => { e.preventDefault(); if (body.trim() && recipient) send.mutate(); }}>
          <Input aria-label="Message" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a message" disabled={!recipient} maxLength={4000} />
          <Button type="submit" aria-label="Send" icon={<Send className="size-4" />} loading={send.isPending} disabled={!recipient || !body.trim()} />
        </form>
      </Card>
    </>
  );
}
