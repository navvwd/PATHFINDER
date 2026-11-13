import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { ProgressBody } from "../../components/ProgressBody";
import { Badge, Card, QueryView } from "../../components/ui";
import { api } from "../../services/api";

export default function ChildScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useQuery({ queryKey: ["child", id], queryFn: () => api.guardians.overview(id) });
  return (
    <ScrollView className="flex-1 bg-bg" contentContainerClassName="p-4 gap-3">
      <QueryView q={q}>
        {(o) => (
          <View className="gap-3">
            <Text className="text-2xl font-bold text-ink">{o.student.full_name}</Text>
            <Card><Text className="mb-2 font-semibold text-ink">Chosen interests</Text><View className="flex-row flex-wrap gap-2">{o.interests.map((i) => <Badge key={i.domain_id}>{i.domain_name}</Badge>)}</View></Card>
            <ProgressBody s={o.progress} />
            <Text className="text-lg font-semibold text-ink">Mentor feedback</Text>
            {o.mentor_feedback.map((f, i) => <Card key={i}><Text className="text-ink">"{f.content}"</Text><Text className="mt-1 text-xs text-subtle">{f.mentor_name}</Text></Card>)}
            <Text className="text-lg font-semibold text-ink">Recent activity</Text>
            {o.recent_activity.slice(0, 8).map((a, i) => <Card key={i}><Text className="text-ink">{a.title ?? a.type}</Text><Text className="text-xs text-subtle">{a.domain_name}{a.score_pct != null ? ` · ${a.score_pct.toFixed(0)}%` : ""}</Text></Card>)}
          </View>
        )}
      </QueryView>
    </ScrollView>
  );
}
