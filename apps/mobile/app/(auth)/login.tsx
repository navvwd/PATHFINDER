import { friendlyError } from "@pathfinder/api-client";
import { loginSchema } from "@pathfinder/validation";
import { Link } from "expo-router";
import { useState } from "react";
import { Image, KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Field } from "../../components/ui";
import { signIn } from "../../services/api";

export default function Login() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const submit = async () => {
    const parsed = loginSchema.safeParse({ identifier, password });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Check your details");
    setLoading(true);
    setError(null);
    try { await signIn(identifier.trim(), password); } catch (e) { setError(friendlyError(e)); } finally { setLoading(false); }
  };
  return (
    <SafeAreaView className="flex-1 bg-bg">
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
        <ScrollView contentContainerClassName="flex-grow justify-center p-6">
          <Image source={require("../../assets/ev-mark.png")} accessibilityLabel="Edutainal Ventures" style={{ width: 100, height: 48 }} resizeMode="contain" className="mb-4" />
          <Text className="text-3xl font-extrabold text-ink">PathFinder <Text className="text-primary">AI</Text></Text>
          <Text className="mb-8 mt-2 text-subtle">Discover what you love. Grow what you're good at.</Text>
          {error ? <Text accessibilityRole="alert" className="mb-3 rounded-xl bg-danger-soft p-3 text-danger">{error}</Text> : null}
          <Field label="Email or mobile number" autoCapitalize="none" autoComplete="username" keyboardType="email-address" value={identifier} onChangeText={setIdentifier} />
          <Field label="Password" secureTextEntry autoComplete="password" value={password} onChangeText={setPassword} />
          <View className="mt-2"><Button label="Sign in" onPress={submit} loading={loading} /></View>
          <Link href="/(auth)/register" className="mt-6 text-center text-primary">New here? Create a student account</Link>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
