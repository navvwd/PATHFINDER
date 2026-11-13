import { friendlyError } from "@pathfinder/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, ScrollView, Text, TextInput, View } from "react-native";
import { Badge, Button, Card, Field, QueryView } from "../../components/ui";
import { api } from "../../services/api";

export default function ActivityScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["activity", id], queryFn: () => api.activities.get(id) });
  const subs = useQuery({ queryKey: ["submissions", id], queryFn: () => api.submissions.list({ activity_id: id }) });
  const [text, setText] = useState("");
  const [link, setLink] = useState("");
  const [reflection, setReflection] = useState("");
  const [files, setFiles] = useState<Array<{ id: string; name: string }>>([]);
  const [uploading, setUploading] = useState(false);
  const submit = useMutation({
    mutationFn: () => api.submissions.create({ activity_id: id, content_text: text || undefined, link_url: link || undefined, file_ids: files.map((f) => f.id), reflection: reflection || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["submissions", id] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); Alert.alert("Submitted!", "Your mentor will review it soon."); },
    onError: (e) => Alert.alert("Couldn't submit", friendlyError(e)),
  });
  const pick = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: ["image/*", "application/pdf", "video/mp4"], copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.[0]) return;
    const asset = res.assets[0];
    setUploading(true);
    try {
      const blob = await (await fetch(asset.uri)).blob();
      const stored = await api.files.upload(blob, asset.name);
      setFiles((f) => [...f, { id: stored.id, name: stored.original_name }]);
    } catch (e) { Alert.alert("Upload failed", friendlyError(e)); } finally { setUploading(false); }
  };
  return (
    <ScrollView className="flex-1 bg-bg" contentContainerClassName="p-4 gap-3">
      <QueryView q={q}>
        {(a) => {
          const pending = subs.data?.items.some((s) => s.status === "submitted");
          const needsText = a.submission_type === "text" || a.submission_type === "mixed";
          const needsLink = a.submission_type === "link" || a.submission_type === "mixed";
          const needsFile = a.submission_type === "file" || a.submission_type === "mixed";
          return (
            <View className="gap-3">
              <Text className="text-2xl font-bold text-ink">{a.title}</Text>
              <View className="flex-row flex-wrap gap-2"><Badge>{a.domain_name}</Badge><Badge>Level {a.difficulty}</Badge><Badge>+{a.xp_reward} XP</Badge></View>
              <Card><Text className="text-ink">{a.description}</Text></Card>
              <Card><Text className="mb-1 font-semibold text-ink">Instructions</Text><Text className="text-ink">{a.instructions}</Text></Card>
              {pending ? <Card><Text className="text-ink">Submitted - waiting for mentor review.</Text></Card> : a.submission_type !== "none" && (
                <Card>
                  {needsText && <View className="mb-3"><Text className="mb-1 text-sm font-medium text-ink">Your answer</Text>
                    <TextInput accessibilityLabel="Your answer" multiline value={text} onChangeText={setText} className="min-h-28 rounded-xl border border-line p-3 text-ink" textAlignVertical="top" /></View>}
                  {needsLink && <Field label="Link to your work" autoCapitalize="none" keyboardType="url" value={link} onChangeText={setLink} />}
                  {needsFile && <View className="mb-3"><Button label={uploading ? "Uploading..." : "Attach a file"} variant="secondary" loading={uploading} onPress={pick} />
                    {files.map((f) => <Text key={f.id} className="mt-1 text-xs text-subtle">📎 {f.name}</Text>)}</View>}
                  <Field label="Reflection (optional)" value={reflection} onChangeText={setReflection} />
                  <Button label="Submit" loading={submit.isPending} onPress={() => submit.mutate()} />
                </Card>
              )}
              {subs.data?.items.map((s) => (
                <Card key={s.id}><Text className="font-medium text-ink">Attempt {s.attempt_no} · {s.status}</Text>
                  {s.evaluations.filter((e) => e.is_current).map((e) => <Text key={e.id} className="mt-1 text-subtle">{e.normalized_score.toFixed(0)}%{e.feedback ? ` - "${e.feedback}"` : ""}</Text>)}</Card>
              ))}
            </View>
          );
        }}
      </QueryView>
    </ScrollView>
  );
}
