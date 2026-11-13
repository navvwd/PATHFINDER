import { friendlyError } from "@pathfinder/api-client";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform, Text, TextInput, View } from "react-native";
import { Button } from "../components/ui";
import { api } from "../services/api";

type Msg = { role: "user" | "assistant"; text: string; label?: string };

export default function AssistantScreen() {
  const [msgs, setMsgs] = useState<Msg[]>([{ role: "assistant", text: "Hi! Ask me what to try next or how your progress is going." }]);
  const [input, setInput] = useState("");
  const send = useMutation({
    mutationFn: (m: string) => api.ai.chat(m),
    onSuccess: (r) => setMsgs((x) => [...x, { role: "assistant", text: r.data.reply + (r.data.suggested_activities.length ? `\n\n${r.data.suggested_activities.map((a) => `• ${a.title}`).join("\n")}` : ""), label: r.source === "ai" ? "AI-generated" : "Rule-based" }]),
    onError: (e) => setMsgs((x) => [...x, { role: "assistant", text: friendlyError(e) }]),
  });
  const submit = () => { const m = input.trim(); if (!m) return; setMsgs((x) => [...x, { role: "user", text: m }]); setInput(""); send.mutate(m); };
  return (
    <KeyboardAvoidingView className="flex-1 bg-bg" behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
      <FlatList data={msgs} keyExtractor={(_, i) => String(i)} contentContainerClassName="p-4 gap-3" renderItem={({ item }) => (
        <View className={`max-w-[85%] rounded-2xl px-4 py-3 ${item.role === "user" ? "self-end bg-primary" : "self-start bg-muted"}`}>
          <Text className={item.role === "user" ? "text-white" : "text-ink"}>{item.text}</Text>
          {item.label ? <Text className="mt-1 text-[10px] text-subtle">{item.label} · grounded in your records</Text> : null}
        </View>
      )} />
      <View className="flex-row items-center gap-2 border-t border-line p-3">
        <TextInput accessibilityLabel="Message" value={input} onChangeText={setInput} maxLength={1000} placeholder="Ask something..." className="flex-1 rounded-xl border border-line px-3 py-3 text-ink" onSubmitEditing={submit} />
        <View className="w-24"><Button label="Send" loading={send.isPending} onPress={submit} /></View>
      </View>
    </KeyboardAvoidingView>
  );
}
