import { GoogleGenAI } from '@google/genai'

let _client: GoogleGenAI | null = null

function getClient(): GoogleGenAI {
  if (!_client) {
    _client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })
  }
  return _client
}

export async function transcribeAudio(
  audioData: ArrayBuffer,
  mimeType: string,
): Promise<string> {
  const client = getClient()

  const base64Audio = Buffer.from(audioData).toString('base64')

  const response = await client.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: [
      {
        role: 'user',
        parts: [
          {
            inlineData: {
              mimeType: mimeType || 'audio/webm',
              data: base64Audio,
            },
          },
          {
            text: 'Transcribe this audio recording exactly. Return only the transcription text, nothing else. If the audio is unclear or empty, return "[inaudible]".',
          },
        ],
      },
    ],
  })

  const text = response.text?.trim()
  if (!text || text === '[inaudible]') {
    throw new Error('Could not transcribe audio')
  }

  return text
}
