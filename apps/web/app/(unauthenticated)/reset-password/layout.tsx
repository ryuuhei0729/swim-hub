import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "パスワードリセット | SwimHub",
  description: "SwimHubのパスワードをリセットします",
  alternates: { canonical: "/reset-password" },
};

export default function ResetPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
