import { friendlyError } from "@pathfinder/api-client";
import type { Attempt } from "@pathfinder/shared-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Button, Card, ErrorView, Loading } from "../../components/ui";
import { api } from "../../services/api";

export default function AssessmentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const start = useQuery({ queryKey: ["attempt-start", id], queryFn: () => api.assessments.start(id), retry: false, staleTime: Infinity, gcTime: 0 });
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [result, setResult] = useState<Attempt | null>(null);
  const submit = useMutation({
    mutationFn: () => api.assessments.submit(start.data!.id, Object.entries(answers).map(([question_id, answer]) => ({ question_id, answer }))),
    onSuccess: (r) => { setResult(r); qc.invalidateQueries({ queryKey: ["assessments"] }); },
    onError: (e) => Alert.alert("Couldn't submit", friendlyError(e)),
  });
  if (start.isLoading) return <Loading />;
  if (start.error) return <ErrorView error={start.error} />;
  if (result) return (
    <View className="flex-1 items-center justify-center bg-bg p-6">
      <Text className="text-xl font-bold text-ink">Done!</Text>
      {result.normalized_score != null ? <Text className="mt-2 text-5xl font-extrabold text-primary">{result.normalized_score.toFixed(0)}%</Text>
        : <Text className="mt-2 text-center text-subtle">Some answers will be reviewed by your mentor.</Text>}
      <Text className="mt-3 text-center text-xs text-subtle">This shows how this attempt went - not a measure of intelligence.</Text>
    </View>
  );
  const att = start.data!;
  return (
    <ScrollView className="flex-1 bg-bg" contentContainerClassName="p-4 gap-3">
      {att.questions.map((q, i) => {
        const opts = q.options as Array<{ key: string; label: string }>;
        return (
          <Card key={q.id}>
            <Text className="mb-2 font-semibold text-ink">{i + 1}. {q.prompt}</Text>
            {q.type === "mcq" ? opts.map((o) => (
              <Pressable key={o.key} accessibilityRole="radio" accessibilityState={{ checked: answers[q.id] === o.key }} onPress={() => setAnswers({ ...answers, [q.id]: o.key })}
                className={`mb-2 rounded-xl border p-3 ${answers[q.id] === o.key ? "border-primary bg-primary-soft" : "border-line"}`}><Text className="text-ink">{o.label}</Text></Pressable>
            )) : (
              <TextInput accessibilityLabel={`Answer ${i + 1}`} multiline={q.type === "long_text"} keyboardType={q.type === "numeric" || q.type === "rating" ? "numeric" : "default"}
                className="rounded-xl border border-line p-3 text-ink" value={answers[q.id] == null ? "" : String(answers[q.id])}
                onChangeText={(t) => setAnswers({ ...answers, [q.id]: q.type === "numeric" || q.type === "rating" ? (t === "" ? null : Number(t)) : t })} />
            )}
          </Card>
        );
      })}
      <Button label="Submit" loading={submit.isPending} onPress={() => submit.mutate()} />
    </ScrollView>
  );
}
