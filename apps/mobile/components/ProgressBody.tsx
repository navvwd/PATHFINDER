import { confidenceStyle } from "@pathfinder/design-system";
import type { ProgressSummary } from "@pathfinder/shared-types";
import { Text, View } from "react-native";
import { Bar, Card } from "./ui";

export function ProgressBody({ s }: { s: ProgressSummary }) {
  const o = s.overall;
  return (
    <View className="gap-3">
      <View className="flex-row gap-3">
        <Card className="flex-1"><Text className="text-xs text-subtle">Initial</Text><Text className="text-xl font-bold text-ink">{o.initial_performance ?? "-"}</Text></Card>
        <Card className="flex-1"><Text className="text-xs text-subtle">Current</Text><Text className="text-xl font-bold text-ink">{o.current_performance ?? "-"}</Text></Card>
        <Card className="flex-1"><Text className="text-xs text-subtle">Change</Text><Text className="text-xl font-bold text-ink">{o.improvement_points == null ? "-" : `${o.improvement_points > 0 ? "+" : ""}${o.improvement_points}`}</Text></Card>
      </View>
      <Text className="text-xs text-subtle">{s.notes.join(" ")}</Text>
      {s.domains.map((d) => (
        <Card key={d.domain_id}>
          <View className="flex-row items-center justify-between"><Text className="font-semibold text-ink">{d.domain_name}</Text>
            <Text style={{ color: confidenceStyle[d.confidence_label]?.color }} className="text-xs">{confidenceStyle[d.confidence_label]?.label}</Text></View>
          <View className="mt-2"><Bar value={d.skill_score ?? 0} color={d.color} /></View>
          <Text className="mt-1 text-xs text-subtle">{d.status === "unexplored" ? "Not yet explored" : `Skill ${d.skill_score ?? "-"} · interest ${d.interest_score ?? "-"} · ${d.evidence_count} records`}</Text>
        </Card>
      ))}
    </View>
  );
}

