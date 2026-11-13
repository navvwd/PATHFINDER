import { useQuery } from "@tanstack/react-query";
import { Linking, ScrollView, Text, View } from "react-native";
import { Badge, Card, Empty, QueryView } from "../components/ui";
import { api } from "../services/api";

export default function PortfolioScreen() {
  const q = useQuery({ queryKey: ["portfolio"], queryFn: () => api.portfolios.get() });
  return (
    <ScrollView className="flex-1 bg-bg" contentContainerClassName="p-4 gap-3">
      <QueryView q={q} isEmpty={(p) => !p.items.length} empty={<Empty title="Your portfolio is empty" body="Add evaluated activities from the web app or after a review." />}>
        {(p) => (
          <View className="gap-3">
            <Text className="text-2xl font-bold text-ink">{p.title}</Text>
            <Text className="text-xs text-subtle">Visibility: {p.visibility} (private by default)</Text>
            {p.items.map((i) => (
              <Card key={i.id} onPress={i.external_url ? () => Linking.openURL(i.external_url!) : undefined}>
                <Badge>{i.category.replace(/_/g, " ")}</Badge>
                <Text className="mt-2 font-semibold text-ink">{i.title}</Text>
                {i.description ? <Text numberOfLines={3} className="text-subtle">{i.description}</Text> : null}
                {i.mentor_feedback ? <Text className="mt-2 text-xs text-subtle">Mentor: "{i.mentor_feedback}"</Text> : null}
              </Card>
            ))}
          </View>
        )}
      </QueryView>
    </ScrollView>
  );
}
