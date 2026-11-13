import { useQuery } from "@tanstack/react-query";
import { ScrollView } from "react-native";
import { ProgressBody } from "../../components/ProgressBody";
import { QueryView, Title } from "../../components/ui";
import { api } from "../../services/api";

export default function Progress() {
  const q = useQuery({ queryKey: ["progress"], queryFn: () => api.progress.summary() });
  return (
    <ScrollView className="flex-1 bg-bg" contentContainerClassName="p-4">
      <Title sub="Compared only with your past self.">Progress</Title>
      <QueryView q={q}>{(s) => <ProgressBody s={s} />}</QueryView>
    </ScrollView>
  );
}
