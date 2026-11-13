import { friendlyError } from "@pathfinder/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, ScrollView, Text, View } from "react-native";
import { Button, Card, QueryView } from "../components/ui";
import { api } from "../services/api";

export default function RecommendationsScreen() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["recommendations"], queryFn: () => api.recommendations.get() });
  const gen = useMutation({ mutationFn: () => api.recommendations.generate(), onSuccess: (d) => qc.setQueryData(["recommendations"], d), onError: (e) => Alert.alert("Error", friendlyError(e)) });
  const respond = useMutation({ mutationFn: (v: { id: string; status: "accepted" | "disagreed" }) => api.recommendations.respond(v.id, v.status), onSuccess: () => qc.invalidateQueries({ queryKey: ["recommendations"] }) });
  return (
    <ScrollView className="flex-1 bg-bg" contentContainerClassName="p-4 gap-3">
      <Button label="Refresh from my latest work" loading={gen.isPending} onPress={() => gen.mutate()} />
      <QueryView q={q}>
        {(r) => (
          <View className="gap-3">
            <Text className="text-subtle">{r.message}</Text>
            <Text className="text-xs text-subtle">{r.disclaimer}</Text>
            {r.items.filter((i) => i.status === "active").map((i) => (
              <Card key={i.id}>
                <Text className="font-semibold text-ink">{i.title}</Text>
                {i.reasons.map((x) => <Text key={x} className="mt-1 text-sm text-subtle">• {x}</Text>)}
                <View className="mt-3 flex-row gap-2">
                  <View className="flex-1"><Button label="Sounds good" onPress={() => respond.mutate({ id: i.id, status: "accepted" })} /></View>
                  <View className="flex-1"><Button label="I disagree" variant="secondary" onPress={() => respond.mutate({ id: i.id, status: "disagreed" })} /></View>
                </View>
              </Card>
            ))}
          </View>
        )}
      </QueryView>
    </ScrollView>
  );
}
