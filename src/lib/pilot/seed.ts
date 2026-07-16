import type { PilotEpisode, PilotState } from './types'

/**
 * Patch Notes continuity model:
 *   seed video (Ep 1) → audience chooses → render next clip
 * Character consistency is the product. Each new episode starts from Devon's
 * face (seed still, or the previous episode's last frame) so he stays the
 * same person night to night.
 */

/** Canonical still of Devon — identity lock for image-to-video. */
export const DEVON_SEED_IMAGE =
  'https://d8j0ntlcm91z4.cloudfront.net/user_3CRsmmUcswTHKARjqkkx1XlBGHU/hf_20260715_205804_28d73e3b-67e5-45ec-9a92-63b27c3dbdf2.png'

/** Opening seed video — Episode 1. The season starts here. */
export const DEVON_SEED_VIDEO =
  'https://d8j0ntlcm91z4.cloudfront.net/user_3CRsmmUcswTHKARjqkkx1XlBGHU/hf_20260715_210005_1751f566-3d4e-49e9-a99b-e21d5f9c45f0.mp4'

/**
 * Continuity inputs for rendering episode N:
 * - previousVideoUrl: the clip we just played (or the seed video)
 * - startImageUrl: still to feed image-to-video (seed face, or last frame of previous)
 */
export function continuityForEpisode(
  state: PilotState,
  episode: PilotEpisode
): { previousVideoUrl: string; startImageUrl: string; previousEpisodeId: string | null } {
  const prior = state.episodes
    .filter((e) => e.number < episode.number && e.videoUrl)
    .sort((a, b) => b.number - a.number)[0]

  return {
    previousVideoUrl: prior?.videoUrl || DEVON_SEED_VIDEO,
    // Prefer prior poster if it was captured from that episode; else seed face.
    startImageUrl: prior?.posterUrl || DEVON_SEED_IMAGE,
    previousEpisodeId: prior?.id ?? null,
  }
}

export function seedState(): PilotState {
  const now = new Date().toISOString()
  return {
    character: {
      name: 'Devon',
      job: 'Junior analyst',
      savings: 6130,
      energy: 54,
      social: 'Sam: 19 days silent',
      mood: 'Restless',
    },
    episodes: [
      {
        id: 'ep-1',
        number: 1,
        title: 'One More Ticket',
        logline:
          "6:40pm. Devon's still at his desk. The group chat is at Lucho's without him.",
        script:
          "Dim office, night. Devon's phone buzzes — a voice note from Marcus: \"Dev. We're at Lucho's. Come through, don't be boring.\" Devon looks from the phone to the wall of unfinished tickets. \"One more ticket... or one good night.\"",
        videoPrompt: '',
        videoUrl: DEVON_SEED_VIDEO,
        posterUrl: DEVON_SEED_IMAGE,
        renderStatus: 'done',
        hfRequestId: null,
        options: [
          {
            id: 'a',
            label: "Go to Lucho's 🍻",
            detail: 'The group chat wins. Social +, Energy −, Savings −$60',
            visualBeat:
              'grabs his jacket off the chair, pockets his phone mid-buzz, and walks toward the office exit',
            votes: 0,
          },
          {
            id: 'b',
            label: 'Hit the gym 🏋️',
            detail: 'Discipline arc continues. Energy +, Social −',
            visualBeat:
              'closes the laptop, stands, and swings a gym bag onto his shoulder under the office lights',
            votes: 0,
          },
          {
            id: 'c',
            label: 'One more ticket 💻',
            detail: 'Grind. Boss notices? Energy −−, Career +?',
            visualBeat:
              'silences the group chat, cracks his knuckles, and leans back into the glowing monitor',
            votes: 0,
          },
        ],
        winnerOptionId: null,
        createdAt: now,
      },
    ],
    voters: {},
    lastCycleAt: null,
  }
}
