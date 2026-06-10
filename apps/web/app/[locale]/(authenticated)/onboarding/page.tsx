import { redirect } from "next/navigation";
import { getServerUser, getServerUserProfile } from "@/lib/supabase-server-auth";
import OnboardingWizard from "./_client/OnboardingWizard";

export default async function OnboardingPage() {
  const user = await getServerUser();

  if (!user) {
    redirect("/login");
  }

  const profile = await getServerUserProfile(user.id);

  if (profile?.onboarding_completed) {
    redirect("/dashboard");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center sm:items-center justify-center bg-black/60 backdrop-blur-sm p-2 sm:p-4">
      <div className="w-full max-w-2xl max-h-[95vh] sm:max-h-[90vh] overflow-y-auto rounded-xl">
        <OnboardingWizard initialProfile={profile} />
      </div>
    </div>
  );
}
