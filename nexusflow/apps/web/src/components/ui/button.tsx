import type { ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";
}

export function Button({ variant = "secondary", className = "", ...props }: ButtonProps) {
  const styles = {
    primary: "bg-[#287D73] text-white hover:bg-[#20665E]",
    secondary: "border border-[#E1E4E2] bg-white text-[#172B3A] hover:bg-[#F5F5F1]",
    ghost: "text-[#68747C] hover:bg-[#F5F5F1] hover:text-[#172B3A]",
  };
  return <button className={`inline-flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-[#287D73] ${styles[variant]} ${className}`} {...props} />;
}
