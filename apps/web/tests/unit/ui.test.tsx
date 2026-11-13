import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiError, PathfinderApi } from "@pathfinder/api-client";
import { ageFromDob, scoringWeightsSchema, studentRegisterSchema } from "@pathfinder/validation";
import { Button, EmptyState, ErrorState, ProgressBar, QueryState, TagInput } from "@/components/ui";
import { score, titleCase } from "@/lib/format";

describe("design system components", () => {
  it("renders a loading button as disabled", () => {
    render(<Button loading>Save</Button>);
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("clamps progress bars and exposes an accessible value", () => {
    render(<ProgressBar value={150} label="XP" />);
    expect(screen.getByRole("progressbar", { name: "XP" })).toHaveAttribute("aria-valuenow", "100");
  });

  it("QueryState shows loading, error, empty and data states", async () => {
    const retry = vi.fn();
    const { rerender } = render(<QueryState q={{ data: undefined, isLoading: true, error: null, refetch: retry }}>{() => <p>data</p>}</QueryState>);
    expect(screen.getByLabelText("Loading")).toBeInTheDocument();
    rerender(<QueryState q={{ data: undefined, isLoading: false, error: new ApiError(500, "x", "Boom"), refetch: retry }}>{() => <p>data</p>}</QueryState>);
    expect(screen.getByRole("alert")).toHaveTextContent("Boom");
    await userEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(retry).toHaveBeenCalled();
    rerender(<QueryState q={{ data: [] as number[], isLoading: false, error: null, refetch: retry }} isEmpty={(d) => !d.length} empty={<EmptyState title="Nothing" />}>{() => <p>data</p>}</QueryState>);
    expect(screen.getByText("Nothing")).toBeInTheDocument();
    rerender(<QueryState q={{ data: [1], isLoading: false, error: null, refetch: retry }}>{(d) => <p>items {d.length}</p>}</QueryState>);
    expect(screen.getByText("items 1")).toBeInTheDocument();
  });

  it("ErrorState explains network failures", () => {
    render(<ErrorState error={new TypeError("Failed to fetch")} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Can't reach the server");
  });

  it("TagInput adds unique tags and removes them", async () => {
    const onChange = vi.fn();
    const { rerender } = render(<TagInput value={["Chess"]} onChange={onChange} />);
    await userEvent.type(screen.getByRole("textbox"), "chess{enter}");
    expect(onChange).not.toHaveBeenCalled(); // case-insensitive duplicate
    await userEvent.type(screen.getByRole("textbox"), "Drawing{enter}");
    expect(onChange).toHaveBeenCalledWith(["Chess", "Drawing"]);
    rerender(<TagInput value={["Chess"]} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Remove Chess" }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });
});

describe("shared validation", () => {
  it("enforces age range, contact and matching passwords", () => {
    const base = { full_name: "Asha Rao", email: "a@example.com", password: "Passw0rd", confirm_password: "Passw0rd", date_of_birth: "2013-02-02" };
    expect(studentRegisterSchema.safeParse(base).success).toBe(true);
    expect(studentRegisterSchema.safeParse({ ...base, email: "", phone: "" }).success).toBe(false);
    expect(studentRegisterSchema.safeParse({ ...base, confirm_password: "nope" }).success).toBe(false);
    expect(studentRegisterSchema.safeParse({ ...base, date_of_birth: "1980-01-01" }).success).toBe(false);
    expect(studentRegisterSchema.safeParse({ ...base, password: "password" }).success).toBe(false);
  });
  it("computes age correctly around birthdays", () => {
    expect(ageFromDob("2010-06-15", new Date("2026-06-14"))).toBe(15);
    expect(ageFromDob("2010-06-15", new Date("2026-06-15"))).toBe(16);
  });
  it("requires scoring weights to total 100%", () => {
    expect(scoringWeightsSchema.safeParse({ a: 0.5, b: 0.5 }).success).toBe(true);
    expect(scoringWeightsSchema.safeParse({ a: 0.5, b: 0.4 }).success).toBe(false);
  });
});

describe("api client", () => {
  it("refreshes once on 401 and retries the request", async () => {
    let token: string | null = "old";
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method} ${url} ${(init?.headers as Record<string, string>).Authorization ?? ""}`);
      if (url.endsWith("/auth/refresh")) return new Response(JSON.stringify({ access_token: "new", token_type: "bearer", expires_in: 900 }), { status: 200 });
      if ((init?.headers as Record<string, string>).Authorization === "Bearer old") return new Response(JSON.stringify({ error: { code: "token_expired", message: "expired" } }), { status: 401 });
      return new Response(JSON.stringify([{ id: "d1" }]), { status: 200 });
    });
    const api = new PathfinderApi({ baseUrl: "/api/v1", mode: "web", getAccessToken: () => token, setAccessToken: (t) => (token = t), fetchImpl: fetchImpl as unknown as typeof fetch });
    const res = await api.domains.list();
    expect(res).toEqual([{ id: "d1" }]);
    expect(token).toBe("new");
    expect(calls.filter((c) => c.includes("/auth/refresh"))).toHaveLength(1);
  });

  it("normalises API errors", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: { code: "forbidden", message: "Nope", request_id: "r1" } }), { status: 403 }));
    const api = new PathfinderApi({ baseUrl: "", mode: "web", getAccessToken: () => "t", setAccessToken: () => {}, fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(api.students.me()).rejects.toMatchObject({ status: 403, code: "forbidden", requestId: "r1" });
  });
});

describe("formatting", () => {
  it("formats scores and labels", () => {
    expect(score(null)).toBe("-");
    expect(score(72.46)).toBe("72");
    expect(titleCase("pending_review")).toBe("Pending Review");
  });
});
