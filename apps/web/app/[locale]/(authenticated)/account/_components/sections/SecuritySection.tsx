"use client";

import React from "react";
import EmailChangeSettings from "@/components/settings/EmailChangeSettings";
import PasswordChangeSettings from "@/components/settings/PasswordChangeSettings";
import IdentityLinkSettings from "@/components/settings/IdentityLinkSettings";
import AccountDeleteSettings from "@/components/settings/AccountDeleteSettings";

export default function SecuritySection() {
  return (
    <>
      <EmailChangeSettings />
      <PasswordChangeSettings />
      <IdentityLinkSettings />
      <AccountDeleteSettings />
    </>
  );
}
