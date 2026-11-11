"use client";

import React from "react";
import GoogleCalendarSyncSettings from "@/components/settings/GoogleCalendarSyncSettings";
import CalendarColorSettings from "@/components/settings/CalendarColorSettings";
import type { UserProfile } from "@apps/shared/types";

interface CalendarSectionProps {
  profile: UserProfile | null;
  onProfileUpdate: () => void;
}

export default function CalendarSection({ profile, onProfileUpdate }: CalendarSectionProps) {
  return (
    <>
      <GoogleCalendarSyncSettings profile={profile} onUpdate={onProfileUpdate} />
      <CalendarColorSettings />
    </>
  );
}
