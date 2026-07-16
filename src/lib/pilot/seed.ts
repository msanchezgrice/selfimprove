import type { PilotEpisode, PilotState } from './types'

/**
 * Patch Notes continuity model:
 *   seed video (Ep 1) → audience chooses a LOCKED camera package → render
 * Character consistency is the product. Face always starts from the seed still.
 */

/** Canonical still of Devon — identity lock for image-to-video. */
export const DEVON_SEED_IMAGE =
  'https://d8j0ntlcm91z4.cloudfront.net/user_3CRsmmUcswTHKARjqkkx1XlBGHU/hf_20260715_205804_28d73e3b-67e5-45ec-9a92-63b27c3dbdf2.png'

/** Opening seed video — Episode 1. The season starts here. */
export const DEVON_SEED_VIDEO =
  'https://d8j0ntlcm91z4.cloudfront.net/user_3CRsmmUcswTHKARjqkkx1XlBGHU/hf_20260715_210005_1751f566-3d4e-49e9-a99b-e21d5f9c45f0.mp4'

/**
 * Continuity inputs for rendering episode N.
 * Face lock: always the canonical Devon seed still.
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
    startImageUrl: DEVON_SEED_IMAGE,
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
            stageDirection:
              'Fade in on Devon at his desk under monitor glow. He reads the group chat, exhales, stands, pulls on his jacket, and walks toward the dark office door. Hold on his face in the doorway for the fade-out.',
            votes: 0,
          },
          {
            id: 'b',
            label: 'Hit the gym 🏋️',
            detail: 'Discipline arc continues. Energy +, Social −',
            visualBeat:
              'closes the laptop, stands, and swings a gym bag onto his shoulder under the office lights',
            stageDirection:
              'Fade in on Devon ignoring another group-chat buzz. He shuts the laptop, stands, hooks a gym bag over one shoulder, and turns toward the elevators. End on his determined face.',
            votes: 0,
          },
          {
            id: 'c',
            label: 'One more ticket 💻',
            detail: 'Grind. Boss notices? Energy −−, Career +?',
            visualBeat:
              'silences the group chat, cracks his knuckles, and leans back into the glowing monitor',
            stageDirection:
              'Fade in on the buzzing phone. Devon flips it face-down, rolls his shoulders, cracks his knuckles, and leans into the ticket on screen. Close on his tired face lit by the monitor.',
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
