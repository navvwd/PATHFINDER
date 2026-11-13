import { friendlyError } from "@pathfinder/api-client";
import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View, type TextInputProps } from "react-native";

export function Screen({ children }: { children: ReactNode }) {
  return <View className="flex-1 bg-bg">{children}</View>;
}

export function Title({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <View className="mb-4">
      <Text className="text-2xl font-bold text-ink">{children}</Text>
      {sub ? <Text className="mt-1 text-subtle">{sub}</Text> : null}
    </View>
  );
}

export function Card({ children, onPress, className = "" }: { children: ReactNode; onPress?: () => void; className?: string }) {
  const body = <View className={`rounded-2xl border border-line bg-surface p-4 ${className}`}>{children}</View>;
  return onPress ? <Pressable accessibilityRole="button" onPress={onPress} className="active:opacity-80">{body}</Pressable> : body;
}

export function Button({ label, onPress, loading, variant = "primary", disabled }: { label: string; onPress: () => void; loading?: boolean; variant?: "primary" | "secondary"; disabled?: boolean }) {
  const cls = variant === "primary" ? "bg-primary" : "bg-surface border border-line";
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: disabled || loading }} disabled={disabled || loading} onPress={onPress}
      className={`h-12 items-center justify-center rounded-xl px-4 ${cls} ${disabled ? "opacity-50" : ""}`}>
      {loading ? <ActivityIndicator color={variant === "primary" ? "#fff" : undefined} /> : <Text className={variant === "primary" ? "font-semibold text-white" : "font-semibold text-ink"}>{label}</Text>}
    </Pressable>
  );
}

export function Field({ label, error, ...props }: TextInputProps & { label: string; error?: string }) {
  return (
    <View className="mb-3">
      <Text className="mb-1 text-sm font-medium text-ink">{label}</Text>
      <TextInput accessibilityLabel={label} placeholderTextColor="#94a3b8" className="rounded-xl border border-line bg-surface px-3 py-3 text-ink" {...props} />
      {error ? <Text className="mt-1 text-sm text-danger">{error}</Text> : null}
    </View>
  );
}

export function Badge({ children }: { children: ReactNode }) {
  return <View className="self-start rounded-full bg-primary-soft px-2.5 py-0.5"><Text className="text-xs font-medium text-primary">{children}</Text></View>;
}

export function Bar({ value, color = "#4f46e5" }: { value: number; color?: string }) {
  return (
    <View accessible accessibilityRole="progressbar" accessibilityValue={{ now: Math.round(Math.max(0, Math.min(100, value))), min: 0, max: 100 }} className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <View style={{ width: `${Math.max(0, Math.min(100, value))}%`, backgroundColor: color }} className="h-full rounded-full" />
    </View>
  );
}

export function Loading() {
  return <View className="flex-1 items-center justify-center p-8"><ActivityIndicator size="large" /></View>;
}

export function ErrorView({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <View className="m-4 items-center rounded-2xl bg-danger-soft p-6">
      <View accessible accessibilityRole="alert" className="items-center">
        <Text className="font-semibold text-ink">We couldn't load this</Text>
        <Text className="mt-1 text-center text-subtle">{friendlyError(error)}</Text>
      </View>
      {onRetry ? <View className="mt-3 w-40"><Button label="Try again" variant="secondary" onPress={onRetry} /></View> : null}
    </View>
  );
}

export function Empty({ title, body }: { title: string; body?: string }) {
  return (
    <View className="items-center rounded-2xl border border-dashed border-line p-8">
      <Text className="font-semibold text-ink">{title}</Text>
      {body ? <Text className="mt-1 text-center text-subtle">{body}</Text> : null}
    </View>
  );
}

export function QueryView<T>({ q, children, isEmpty, empty }: { q: { data: T | undefined; isLoading: boolean; error: unknown; refetch: () => unknown }; children: (d: T) => ReactNode; isEmpty?: (d: T) => boolean; empty?: ReactNode }) {
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorView error={q.error} onRetry={() => q.refetch()} />;
  if (q.data === undefined) return null;
  if (isEmpty?.(q.data)) return <>{empty}</>;
  return <>{children(q.data)}</>;
}
