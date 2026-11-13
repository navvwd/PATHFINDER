/// <reference types="jest" />
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { ProgressBody } from "../components/ProgressBody";
import { Bar, Button, ErrorView, QueryView } from "../components/ui";
import { useSession } from "../hooks/useSession";
import * as SecureStore from "expo-secure-store";
import { signIn } from "../services/api";

jest.mock("expo-secure-store", () => ({ getItemAsync: jest.fn(async () => null), setItemAsync: jest.fn(), deleteItemAsync: jest.fn(), WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1 }));
jest.mock("expo-constants", () => ({ expoConfig: { extra: { apiUrl: "http://api.test/api/v1" } } }));

describe("mobile components", () => {
  it("button is disabled while loading", async () => {
    const onPress = jest.fn();
    await render(<Button label="Save" loading onPress={onPress} />);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("progress bar clamps its value", async () => {
    await render(<Bar value={140} />);
    expect(screen.getByRole("progressbar").props.accessibilityValue.now).toBe(100);
  });

  it("QueryView renders error with retry", async () => {
    const retry = jest.fn();
    await render(<QueryView q={{ data: undefined, isLoading: false, error: new Error("Failed to fetch"), refetch: retry }}>{() => null}</QueryView>);
    expect(screen.getByText(/Can't reach the server/)).toBeTruthy();
    await fireEvent.press(screen.getByText("Try again"));
    expect(retry).toHaveBeenCalled();
  });

  it("ErrorView is announced as an alert", async () => {
    await render(<ErrorView error={new Error("x")} />);
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("ProgressBody distinguishes unexplored domains from weak ones", async () => {
    await render(<ProgressBody s={{
      overall: { evidence_count: 0, initial_performance: null, current_performance: null, average_performance: null, improvement_points: null,
        improvement_percentage: null, trend_per_30_days: null, trend_label: "insufficient_data", comparable_groups: 0, completion_rate: null, consistency: 0, notes: [] },
      notes: ["Unexplored domains are opportunities, not weaknesses."],
      domains: [{ domain_id: "1", domain_name: "Sports", color: "#f00", status: "unexplored", skill_score: null, progress_score: null, interest_score: null,
        confidence: 0, confidence_label: "none", evidence_count: 0, initial_performance: null, current_performance: null, average_performance: null,
        improvement_points: null, trend_label: "insufficient_data", completion_rate: null }],
    }} />);
    expect(screen.getAllByText(/Not yet explored/).length).toBeGreaterThan(0);
  });
});

describe("session + shared api client", () => {
  it("signs in through the shared client and stores the session", async () => {
    const calls: string[] = [];
    globalThis.fetch = jest.fn(async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method} ${url}`);
      if (url.endsWith("/auth/login")) return new Response(JSON.stringify({ access_token: "a1", refresh_token: "r1", token_type: "bearer", expires_in: 900 }), { status: 200 });
      return new Response(JSON.stringify({ user: { id: "u", role: "student", full_name: "Test" }, permissions: [], ui_mode: "senior", onboarding_complete: true }), { status: 200 });
    }) as unknown as typeof fetch;
    await signIn("kid@example.com", "Passw0rd");
    await waitFor(() => expect(useSession.getState().status).toBe("authenticated"));
    expect(useSession.getState().accessToken).toBe("a1");
    expect(calls[0]).toBe("POST http://api.test/api/v1/auth/login");
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith("pf_refresh_token", "r1", expect.anything());
  });
});
