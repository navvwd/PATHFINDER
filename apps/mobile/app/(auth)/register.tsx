import { friendlyError } from "@pathfinder/api-client";
import { studentRegisterSchema } from "@pathfinder/validation";
import { Link } from "expo-router";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Field } from "../../components/ui";
import { useSession } from "../../hooks/useSession";
import { api } from "../../services/api";

export default function Register() {
  const [f, setF] = useState({ full_name: "", email: "", phone: "", password: "", confirm_password: "", date_of_birth: "", institution_code: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });
  const submit = async () => {
    const parsed = studentRegisterSchema.safeParse(f);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      await api.auth.registerStudent({ full_name: f.full_name, email: f.email || undefined, phone: f.phone || undefined, password: f.password,
        date_of_birth: f.date_of_birth, institution_code: f.institution_code || undefined });
      useSession.getState().setMe(await api.auth.me());
    } catch (e) { setErrors({ form: friendlyError(e) }); } finally { setLoading(false); }
  };
  return (
    <SafeAreaView className="flex-1 bg-bg">
      <ScrollView contentContainerClassName="p-6">
        <Text className="mb-6 text-2xl font-bold text-ink">Create your account</Text>
        {errors.form ? <Text accessibilityRole="alert" className="mb-3 rounded-xl bg-danger-soft p-3 text-danger">{errors.form}</Text> : null}
        <Field label="Full name" value={f.full_name} onChangeText={set("full_name")} error={errors.full_name} />
        <Field label="Email" autoCapitalize="none" keyboardType="email-address" value={f.email} onChangeText={set("email")} error={errors.email} />
        <Field label="or Mobile number" keyboardType="phone-pad" value={f.phone} onChangeText={set("phone")} error={errors.phone} />
        <Field label="Date of birth (YYYY-MM-DD)" placeholder="2012-05-20" value={f.date_of_birth} onChangeText={set("date_of_birth")} error={errors.date_of_birth} />
        <Field label="Password" secureTextEntry value={f.password} onChangeText={set("password")} error={errors.password} />
        <Field label="Confirm password" secureTextEntry value={f.confirm_password} onChangeText={set("confirm_password")} error={errors.confirm_password} />
        <Field label="School code (optional)" autoCapitalize="characters" value={f.institution_code} onChangeText={set("institution_code")} />
        <View className="mt-2"><Button label="Create account" onPress={submit} loading={loading} /></View>
        <Text className="mt-4 text-xs text-subtle">Under 18? A parent or guardian will be asked to give consent. Onboarding continues on the web or in the app.</Text>
        <Link href="/(auth)/login" className="mt-6 text-center text-primary">Already have an account? Sign in</Link>
      </ScrollView>
    </SafeAreaView>
  );
}
