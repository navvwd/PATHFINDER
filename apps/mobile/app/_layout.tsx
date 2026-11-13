import "../global.css";
import { ApiError } from "@pathfinder/api-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Loading } from "../components/ui";
import { useSession } from "../hooks/useSession";
import { restoreSession } from "../services/api";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: (n, e) => !(e instanceof ApiError && e.status < 500) && n < 2 } },
});

function AuthGate() {
  const status = useSession((s) => s.status);
  const me = useSession((s) => s.me);
  const segments = useSegments();
  const router = useRouter();
  useEffect(() => { void restoreSession(); }, []);
  useEffect(() => {
    if (status === "unknown") return;
    const inAuth = segments[0] === "(auth)";
    if (status === "anonymous" && !inAuth) router.replace("/(auth)/login");
    else if (status === "authenticated" && inAuth) router.replace("/(tabs)");
  }, [status, segments, router, me]);
  if (status === "unknown") return <Loading />;
  return (
    <Stack screenOptions={{ headerShadowVisible: false, headerTitleStyle: { fontWeight: "700" } }}>
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="activity/[id]" options={{ title: "Activity" }} />
      <Stack.Screen name="domain/[slug]" options={{ title: "Domain" }} />
      <Stack.Screen name="assessment/[id]" options={{ title: "Assessment" }} />
      <Stack.Screen name="child/[id]" options={{ title: "Child progress" }} />
      <Stack.Screen name="notifications" options={{ title: "Notifications" }} />
      <Stack.Screen name="recommendations" options={{ title: "Recommendations" }} />
      <Stack.Screen name="assistant" options={{ title: "AI Assistant" }} />
      <Stack.Screen name="portfolio" options={{ title: "Portfolio" }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="auto" />
        <AuthGate />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
