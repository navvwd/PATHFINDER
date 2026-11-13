import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { Badge, Card, QueryView } from "../../components/ui";
import { api } from "../../services/api";

export default function DomainScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const q = useQuery({ queryKey: ["domain", slug], queryFn: () => api.domains.get(slug) });
  const acts = useQuery({ queryKey: ["activities", "domain", q.data?.id], enabled: !!q.data, queryFn: () => api.activities.list({ domain_id: q.data!.id, page_size: 20 }) });
  return (
    <ScrollView className="flex-1 bg-bg" contentContainerClassName="p-4 gap-3">
      <QueryView q={q}>
        {(d) => (
          <View className="gap-3">
            <View style={{ backgroundColor: d.color }} className="h-2 w-14 rounded-full" />
            <Text className="text-2xl font-bold text-ink">{d.name}</Text>
            <Text className="text-subtle">{d.description}</Text>
            <Card><Text className="mb-2 font-semibold text-ink">Why explore it?</Text>{d.advantages.map((a) => <Text key={a} className="text-ink">• {a}</Text>)}</Card>
            <Card><Text className="mb-2 font-semibold text-ink">Subdomains</Text><View className="flex-row flex-wrap gap-2">{d.subdomains.map((s) => <Badge key={s.id}>{s.name}</Badge>)}</View></Card>
            <Text className="text-lg font-semibold text-ink">Activities</Text>
            {acts.data?.items.map((a) => (
              <Card key={a.id} onPress={() => router.push(`/activity/${a.id}`)}><Text className="font-semibold text-ink">{a.title}</Text><Text className="text-xs text-subtle">Level {a.difficulty} · {a.estimated_minutes} min</Text></Card>
            ))}
          </View>
        )}
      </QueryView>
    </ScrollView>
  );
}
