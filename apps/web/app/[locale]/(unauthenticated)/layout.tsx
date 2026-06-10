import LanguageSwitcher from "@/components/ui/LanguageSwitcher";

export default function UnauthenticatedGroupLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* 認証前ページ共通の言語切替 (右上に絶対配置)。
          login/signup/reset-password 等で locale を切り替えできるようにする。 */}
      <div className="fixed top-3 right-3 z-50 sm:top-4 sm:right-4">
        <LanguageSwitcher />
      </div>
      {children}
    </>
  );
}
