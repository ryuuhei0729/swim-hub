import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/constants";

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/dashboard",
          "/settings",
          "/mypage",
          "/competition",
          "/practice",
          "/goals",
          "/bulk-besttime",
          "/teams",
          "/teams-admin",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
