import React from "react";
import { useSkills } from "../hooks/useSkills";

interface SkillSelectorProps {
  value: string | null;
  onChange: (skillId: string | null) => void;
  disabled?: boolean;
}

export function SkillSelector({ value, onChange, disabled }: SkillSelectorProps) {
  const { skills, isLoading } = useSkills();

  if (isLoading) {
    return (
      <select className="select select-bordered flex-1 bg-base-100 px-4 opacity-50" disabled>
        <option>Loading skills...</option>
      </select>
    );
  }

  if (skills.length === 0) return null;

  return (
    <select
      className="select select-bordered flex-1 bg-base-100 px-4"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      disabled={disabled}
    >
      <option value="">No skill</option>
      {skills.map((skill) => (
        <option key={skill.id} value={skill.id}>
          {skill.filename}
        </option>
      ))}
    </select>
  );
}
