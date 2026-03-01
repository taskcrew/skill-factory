import { useQuery } from "@tanstack/react-query";
import { BACKEND_URL } from "../config";

export interface Skill {
  id: string;
  name: string;
  filename: string;
  description: string | null;
  created_at: string;
}

interface PaginatedSkills {
  data: Skill[];
  total: number;
  limit: number;
  offset: number;
}

async function fetchSkills(): Promise<PaginatedSkills> {
  const res = await fetch(`${BACKEND_URL}/api/skills?limit=100`);
  if (!res.ok) {
    throw new Error(`Failed to fetch skills: ${res.status}`);
  }
  return res.json();
}

export function useSkills() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["skills"],
    queryFn: fetchSkills,
    refetchOnWindowFocus: false,
  });

  return {
    skills: data?.data ?? [],
    total: data?.total ?? 0,
    isLoading,
    error,
  };
}
