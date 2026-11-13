import { Tabs } from "expo-router";
import { Text, type ColorValue } from "react-native";
import { useSession } from "../../hooks/useSession";

const icon = (glyph: string) => ({ color }: { color: ColorValue }) => <Text style={{ color, fontSize: 18 }}>{glyph}</Text>;

export default function TabsLayout() {
  const role = useSession((s) => s.me?.user.role);
  const student = role === "student";
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: "#ff4d24", headerShadowVisible: false }}>
      <Tabs.Screen name="index" options={{ title: student ? "Home" : "Children", tabBarIcon: icon("⌂") }} />
      <Tabs.Screen name="domains" options={{ title: "Explore", tabBarIcon: icon("◎"), href: student ? undefined : null }} />
      <Tabs.Screen name="activities" options={{ title: "Activities", tabBarIcon: icon("✦"), href: student ? undefined : null }} />
      <Tabs.Screen name="progress" options={{ title: "Progress", tabBarIcon: icon("↗"), href: student ? undefined : null }} />
      <Tabs.Screen name="profile" options={{ title: "Profile", tabBarIcon: icon("☺") }} />
    </Tabs>
  );
}
