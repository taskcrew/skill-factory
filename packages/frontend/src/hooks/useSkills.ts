import { useQuery } from "@tanstack/react-query";
import { BACKEND_URL } from "../config";

export interface Skill {
  id: string;
  name: string;
  filename: string;
  description: string | null;
  content: string;
  created_at: string;
  updated_at: string;
}

interface PaginatedSkills {
  data: Skill[];
  total: number;
  limit: number;
  offset: number;
}

interface UseSkillsParams {
  limit?: number;
  offset?: number;
}

async function fetchSkills(limit: number, offset: number): Promise<PaginatedSkills> {
  const res = await fetch(`${BACKEND_URL}/api/skills?limit=${limit}&offset=${offset}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch skills: ${res.status}`);
  }
  return res.json();
}

export function useSkills(params?: UseSkillsParams) {
  const limit = params?.limit ?? 100;
  const offset = params?.offset ?? 0;

  const { data, isLoading, error } = useQuery({
    queryKey: ["skills", { limit, offset }],
    queryFn: () => fetchSkills(limit, offset),
    refetchOnWindowFocus: false,
  });

  return {
    skills: data?.data ?? [],
    total: data?.total ?? 0,
    isLoading,
    error,
  };
}
