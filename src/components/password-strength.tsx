import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface Strength {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  color: string;
  checks: { label: string; passed: boolean }[];
}

function evaluate(password: string): Strength {
  const checks = [
    { label: "8+ characters", passed: password.length >= 8 },
    { label: "Upper & lowercase", passed: /[a-z]/.test(password) && /[A-Z]/.test(password) },
    { label: "Number", passed: /\d/.test(password) },
    { label: "Symbol", passed: /[^A-Za-z0-9]/.test(password) },
  ];
  if (!password) {
    return { score: 0, label: "", color: "", checks };
  }
  const passed = checks.filter((c) => c.passed).length;
  if (passed <= 1) return { score: 1, label: "Weak", color: "bg-rose-500", checks };
  if (passed === 2) return { score: 2, label: "Fair", color: "bg-amber-500", checks };
  if (passed === 3) return { score: 3, label: "Good", color: "bg-lime-500", checks };
  return { score: 4, label: "Strong", color: "bg-emerald-500", checks };
}

export function PasswordStrength({ password }: { password: string }) {
  if (!password) return null;
  const strength = evaluate(password);

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1.5">
          {[1, 2, 3, 4].map((level) => (
            <span
              key={level}
              className={cn(
                "h-1.5 flex-1 rounded-full transition-colors",
                level <= strength.score ? strength.color : "bg-muted",
              )}
            />
          ))}
        </div>
        <span className="w-14 text-right text-xs font-medium text-muted-foreground">
          {strength.label}
        </span>
      </div>

      {strength.score < 4 && (
        <ul className="flex flex-wrap gap-x-3 gap-y-1">
          {strength.checks.map((check) => (
            <li
              key={check.label}
              className={cn(
                "flex items-center gap-1 text-[11px]",
                check.passed ? "text-emerald-400" : "text-muted-foreground",
              )}
            >
              <Check
                className={cn("h-3 w-3", !check.passed && "opacity-30")}
                strokeWidth={3}
              />
              {check.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}