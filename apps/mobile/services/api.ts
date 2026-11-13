/**
 * Mobile uses the exact same typed client as the web app (packages/api-client),
 * so no business logic is duplicated. Access token lives in memory; the refresh
 * token is kept in the device keychain/keystore via expo-secure-store.
 */
import { PathfinderApi } from "@pathfinder/api-client";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { useSession } from "../hooks/useSession";

const REFRESH_KEY = "pf_refresh_token";

function defaultBaseUrl(): string {
  const fromConfig = (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl;
  if (fromConfig) return fromConfig;
  // Android emulator reaches the host machine via 10.0.2.2
  return Platform.OS === "android" ? "http://10.0.2.2:8000/api/v1" : "http://localhost:8000/api/v1";
}

export const secureStorage = {
  get: async () => (Platform.OS === "web" ? null : SecureStore.getItemAsync(REFRESH_KEY)),
  set: async (v: string | null) => {
    if (Platform.OS === "web") return;
    if (v) await SecureStore.setItemAsync(REFRESH_KEY, v, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
    else await SecureStore.deleteItemAsync(REFRESH_KEY);
  },
};

export const api = new PathfinderApi({
  baseUrl: process.env.EXPO_PUBLIC_API_URL ?? defaultBaseUrl(),
  mode: "mobile",
  getAccessToken: () => useSession.getState().accessToken,
  setAccessToken: (t) => useSession.getState().setToken(t),
  getRefreshToken: secureStorage.get,
  setRefreshToken: secureStorage.set,
  onSessionExpired: () => useSession.getState().reset(),
});

export async function restoreSession(): Promise<void> {
  const ok = await api.refresh();
  if (!ok) return useSession.getState().setMe(null);
  try {
    useSession.getState().setMe(await api.auth.me());
  } catch {
    useSession.getState().reset();
  }
}

export async function signIn(identifier: string, password: string) {
  await api.auth.login(identifier, password);
  const me = await api.auth.me();
  useSession.getState().setMe(me);
  return me;
}

export async function signOut() {
  try { await api.auth.logout(); } finally { useSession.getState().reset(); }
}
