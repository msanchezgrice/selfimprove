import type { Metadata } from "next";
import PilotClient from "./pilot-client";

export const metadata: Metadata = {
  title: "Pilot — The Show That Ships Itself",
  description:
    "A self-improving pilot: the community votes on the story every night and on platform features every morning. One AI writes the episodes, renders the video, and ships the code.",
};

export default function PilotPage() {
  return <PilotClient />;
}
