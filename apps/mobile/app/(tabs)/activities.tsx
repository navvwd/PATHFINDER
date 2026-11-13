import { useQuery } from "@tanstack/react-query";
import { categoryLabels } from "@pathfinder/design-system";
import { useRouter } from "expo-router";
import { useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { Badge, Card, Empty, QueryView } from "../../components/ui";
import { api } from "../../services/api";

export default function Activities() {
  const router = useRouter();
  const [tab, setTab] = useState<"activities" | "assessments">("activities");
  const acts = useQuery({ queryKey: ["activities", "mobile"], queryFn: () => api.activities.list({ page_size: 50 }) });
  const asms = useQuery({ queryKey: ["assessments", "mobile"], queryFn: () => api.assessments.list({ page_size: 50 }) });
  return (
    <View className="flex-1 bg-bg">
      <View className="m-4 flex-row rounded-xl bg-muted p-1">
        {(["activities", "assessments"] as const).map((t) => (
          <Pressable key={t} accessibilityRole="tab" accessibilityState={{ selected: tab === t }} onPress={() => setTab(t)} className={`flex-1 items-center rounded-lg py-2 ${tab === t ? "bg-surface" : ""}`}>
            <Text className={tab === t ? "font-semibold text-ink" : "text-subtle"}>{t === "activities" ? "Activities" : "Assessments"}</Text>
          </Pressable>
        ))}
      </View>
      {tab === "activities" ? (
        <QueryView q={acts} isEmpty={(d) => !d.items.length} empty={<Empty title="No activities" />}>
          {(d) => <FlatList data={d.items} keyExtractor={(a) => a.id} contentContainerClassName="px-4 pb-6 gap-3" renderItem={({ item: a }) => (
            <Card onPress={() => router.push(`/activity/${a.id}`)}>
              <View className="flex-row items-center justify-between"><Badge>{a.domain_name}</Badge>{a.my_status ? <Text className="text-xs text-subtle">{a.my_status}</Text> : null}</View>
              <Text className="mt-2 font-semibold text-ink">{a.title}</Text>
              <Text className="text-xs text-subtle">{categoryLabels[a.category]} · Level {a.difficulty} · {a.estimated_minutes} min</Text>
            </Card>
          )} />}
        </QueryView>
      ) : (
        <QueryView q={asms} isEmpty={(d) => !d.items.length} empty={<Empty title="No assessments" />}>
          {(d) => <FlatList data={d.items} keyExtractor={(a) => a.id} contentContainerClassName="px-4 pb-6 gap-3" renderItem={({ item: a }) => (
            <Card onPress={() => router.push(`/assessment/${a.id}`)}>
              <Badge>{a.domain_name}</Badge>
              <Text className="mt-2 font-semibold text-ink">{a.title}</Text>
              <Text className="text-xs text-subtle">{a.question_count} questions · attempts {a.my_attempts ?? 0}/{a.max_attempts}{a.my_best_score != null ? ` · best ${a.my_best_score.toFixed(0)}%` : ""}</Text>
            </Card>
          )} />}
        </QueryView>
      )}
    </View>
  );
}
