import { permanentRedirect } from "next/navigation";

/**
 * Canon is now a standalone product with its own repository and Vercel
 * project. Keep the legacy SelfImprove URL as a permanent handoff only.
 */
export default function PilotPage() {
  permanentRedirect("https://makeitcanon.com");
}
