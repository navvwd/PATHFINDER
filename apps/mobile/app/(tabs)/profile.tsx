import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, ScrollView, Switch, Text, View } from "react-native";
import { Button, Card, Title } from "../../components/ui";
import { useReminders } from "../../hooks/useReminders";
import { useSession } from "../../hooks/useSession";
import { api, signOut } from "../../services/api";

export default function Profile() {
  const me = useSession((s) => s.me)!;
  const router = useRouter();
  const reminders = useReminders();
  const [remind, setRemind] = useState(false);
  const unread = useQuery({ queryKey: ["unread"], queryFn: () => api.notifications.unread() });
  const onboarding = useQuery({ queryKey: ["onboarding"], queryFn: () => api.students.onboarding(), enabled: me.user.role === "student" });
  return (
    <ScrollView className="flex-1 bg-bg" contentContainerClassName="p-4 gap-3">
      <Title sub={me.user.email ?? me.user.phone ?? ""}>{me.user.full_name}</Title>
      <Card onPress={() => router.push("/notifications")}><Text className="font-semibold text-ink">Notifications {unread.data?.count ? `(${unread.data.count} new)` : ""}</Text></Card>
      {onboarding.data && (
        <Card><Text className="font-semibold text-ink">Guardian invite code</Text>
          <Text selectable className="mt-1 font-mono text-2xl tracking-widest text-primary-ink">{onboarding.data.guardian_invite_code}</Text>
          <Text className="text-xs text-subtle">Consent: {onboarding.data.consent_status.replace("_", " ")}</Text></Card>
      )}
      {me.user.role === "student" && (
        <Card><View className="flex-row items-center justify-between"><Text className="text-ink">Daily learning reminder</Text>
          <Switch accessibilityLabel="Daily learning reminder" value={remind} onValueChange={async (v) => { if (v) { const ok = await reminders.enable(); setRemind(ok); if (!ok) Alert.alert("Notifications are blocked in system settings"); } else { await reminders.disable(); setRemind(false); } }} /></View></Card>
      )}
      <View className="mt-4"><Button label="Sign out" variant="secondary" onPress={() => void signOut()} /></View>
    </ScrollView>
  );
}
