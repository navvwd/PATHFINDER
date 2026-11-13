import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { Card, QueryView, Title } from "../../components/ui";
import { api } from "../../services/api";

export default function Domains() {
  const router = useRouter();
  const q = useQuery({ queryKey: ["domains"], queryFn: () => api.domains.list() });
  return (
    <ScrollView className="flex-1 bg-bg" contentContainerClassName="p-4 gap-3">
      <Title sub="Exploring doesn't commit you to anything.">Six domains</Title>
      <QueryView q={q}>
        {(list) => <>{list.map((d) => (
          <Card key={d.id} onPress={() => router.push(`/domain/${d.slug}`)}>
            <View style={{ backgroundColor: d.color }} className="mb-2 h-1.5 w-10 rounded-full" />
            <Text className="text-lg font-semibold text-ink">{d.name}</Text>
            <Text className="text-subtle">{d.tagline}</Text>
            <Text className="mt-2 text-xs text-subtle">{d.subdomains.map((s) => s.name).join(" · ")}</Text>
          </Card>
        ))}</>}
      </QueryView>
    </ScrollView>
  );
}
