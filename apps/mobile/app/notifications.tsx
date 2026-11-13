import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FlatList, Text, View } from "react-native";
import { Button, Card, Empty, QueryView } from "../components/ui";
import { api } from "../services/api";

export default function NotificationsScreen() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["notifications", "mobile"], queryFn: () => api.notifications.list({ page_size: 50 }) });
  const readAll = useMutation({ mutationFn: () => api.notifications.readAll(), onSuccess: () => { qc.invalidateQueries({ queryKey: ["notifications"] }); qc.invalidateQueries({ queryKey: ["unread"] }); } });
  return (
    <View className="flex-1 bg-bg">
      <View className="p-4"><Button label="Mark all read" variant="secondary" loading={readAll.isPending} onPress={() => readAll.mutate()} /></View>
      <QueryView q={q} isEmpty={(d) => !d.items.length} empty={<View className="px-4"><Empty title="You're all caught up" /></View>}>
        {(d) => <FlatList data={d.items} keyExtractor={(n) => n.id} contentContainerClassName="px-4 pb-6 gap-2" renderItem={({ item: n }) => (
          <Card><Text className={n.read_at ? "text-ink" : "font-semibold text-ink"}>{n.title}</Text>{n.body ? <Text className="text-subtle">{n.body}</Text> : null}</Card>
        )} />}
      </QueryView>
    </View>
  );
}
