import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { Badge, Bar, Card, Empty, QueryView, Title } from "../../components/ui";
import { useSession } from "../../hooks/useSession";
import { api } from "../../services/api";

export default function Home() {
  const role = useSession((s) => s.me?.user.role);
  if (role === "guardian") return <GuardianHome />;
  if (role !== "student") return <StaffNotice />;
  return <StudentHome />;
}

function StudentHome() {
  const router = useRouter();
  const q = useQuery({ queryKey: ["dashboard"], queryFn: () => api.students.dashboard() });
  return (
    <ScrollView className="flex-1 bg-bg" contentContainerClassName="p-4" refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => { void q.refetch(); }} />}>
      <QueryView q={q}>
        {(d) => (
          <View className="gap-4">
            <Title sub={d.ui_mode === "junior" ? "Let's learn something awesome today!" : "Here's your learning snapshot."}>{d.greeting}</Title>
            <View className="flex-row gap-3">
              <Card className="flex-1"><Text className="text-subtle">Level</Text><Text className="text-2xl font-bold text-ink">{d.stats.level as number}</Text>
                <View className="mt-2"><Bar value={((d.stats.xp_into_level as number) / (d.stats.xp_for_next_level as number)) * 100} /></View></Card>
              <Card className="flex-1"><Text className="text-subtle">Streak</Text><Text className="text-2xl font-bold text-ink">{d.stats.current_streak as number} 🔥</Text>
                <Text className="text-xs text-subtle">{d.stats.xp as number} XP</Text></Card>
            </View>
            <Text className="text-lg font-semibold text-ink">Today's activities</Text>
            {d.daily_activities.length === 0 ? <Empty title="All caught up!" /> : d.daily_activities.map((a) => (
              <Card key={a.id as string} onPress={() => router.push(`/activity/${a.id}`)}>
                <View style={{ backgroundColor: a.domain_color as string }} className="mb-2 h-1.5 w-8 rounded-full" />
                <Text className="font-semibold text-ink">{a.title as string}</Text>
                <Text className="text-xs text-subtle">{a.domain_name as string} · {a.estimated_minutes as number} min · +{a.xp_reward as number} XP</Text>
              </Card>
            ))}
            <Text className="text-lg font-semibold text-ink">Weekly goals</Text>
            {d.weekly_goals.map((g) => (
              <Card key={g.id as string}><View className="mb-2 flex-row justify-between"><Text className="text-ink">{g.title as string}</Text><Text className="text-subtle">{g.current as number}/{g.target as number}</Text></View>
                <Bar value={((g.current as number) / (g.target as number)) * 100} color={g.status === "completed" ? "#059669" : undefined} /></Card>
            ))}
            {d.recommendations.length > 0 && <>
              <Text className="text-lg font-semibold text-ink">Suggested for you</Text>
              {d.recommendations.map((r) => (
                <Card key={r.id as string} onPress={() => (r.activity_id ? router.push(`/activity/${r.activity_id}`) : router.push("/recommendations"))}>
                  <Text className="font-medium text-ink">{r.title as string}</Text><Text className="text-xs text-subtle">{(r.reasons as string[])[0]}</Text>
                </Card>
              ))}
            </>}
            <View className="flex-row gap-3">
              <View className="flex-1"><Card onPress={() => router.push("/assistant")}><Text className="font-semibold text-ink">AI Assistant</Text></Card></View>
              <View className="flex-1"><Card onPress={() => router.push("/portfolio")}><Text className="font-semibold text-ink">Portfolio</Text></Card></View>
            </View>
          </View>
        )}
      </QueryView>
    </ScrollView>
  );
}

function GuardianHome() {
  const router = useRouter();
  const q = useQuery({ queryKey: ["children"], queryFn: () => api.guardians.children() });
  return (
    <ScrollView className="flex-1 bg-bg" contentContainerClassName="p-4 gap-3">
      <Title sub="Authorised learning records for your children">My children</Title>
      <QueryView q={q} isEmpty={(d) => !d.length} empty={<Empty title="No children linked" body="Use your child's invite code on the web portal to link." />}>
        {(kids) => <>{kids.map((k) => (
          <Card key={k.id} onPress={() => router.push(`/child/${k.id}`)}>
            <Text className="text-lg font-semibold text-ink">{k.full_name}</Text>
            <Text className="text-subtle">{k.age_group} · {k.xp} XP · {k.current_streak}-day streak</Text>
            <View className="mt-2"><Badge>Consent: {k.consent_status.replace("_", " ")}</Badge></View>
          </Card>
        ))}</>}
      </QueryView>
    </ScrollView>
  );
}

function StaffNotice() {
  return (
    <View className="flex-1 items-center justify-center bg-bg p-6">
      <Text className="text-center text-lg font-semibold text-ink">Mentor and admin tools are on the web portal.</Text>
      <Text className="mt-2 text-center text-subtle">The mobile app is designed for students and parents.</Text>
    </View>
  );
}
