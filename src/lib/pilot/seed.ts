import type { PilotState } from './types'

/**
 * Devon's canonical seed image — used as the start frame for every episode
 * render so his look stays consistent across the season.
 */
export const DEVON_SEED_IMAGE =
  'https://d8j0ntlcm91z4.cloudfront.net/user_3CRsmmUcswTHKARjqkkx1XlBGHU/hf_20260715_205804_28d73e3b-67e5-45ec-9a92-63b27c3dbdf2.png'

const EPISODE_1_VIDEO =
  'https://d8j0ntlcm91z4.cloudfront.net/user_3CRsmmUcswTHKARjqkkx1XlBGHU/hf_20260715_210005_1751f566-3d4e-49e9-a99b-e21d5f9c45f0.mp4'

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
        videoUrl: EPISODE_1_VIDEO,
        posterUrl: DEVON_SEED_IMAGE,
        renderStatus: 'done',
        hfRequestId: null,
        options: [
          {
            id: 'a',
            label: "Go to Lucho's 🍻",
            detail: 'The group chat wins. Social +, Energy −, Savings −$60',
            votes: 0,
          },
          {
            id: 'b',
            label: 'Hit the gym 🏋️',
            detail: 'Discipline arc continues. Energy +, Social −',
            votes: 0,
          },
          {
            id: 'c',
            label: 'One more ticket 💻',
            detail: 'Grind. Boss notices? Energy −−, Career +?',
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
