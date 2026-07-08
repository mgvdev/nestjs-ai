# Multimodal

Three injectable services wrap the AI SDK's image, speech, and transcription
APIs. Set `defaultImageModel` / `defaultSpeechModel` /
`defaultTranscriptionModel`, or pass `model` per call.

## Image generation

```ts
import { ImageService } from '@mgvdev/nestjs-ai';

const { image, images } = await this.images.generate('a fox in the snow', {
  model: 'openai:dall-e-3',
  size: '1024x1024',
  aspectRatio: '16:9',
  n: 1,
});
// image: GeneratedFile (base64 / bytes)
```

## Speech (text-to-speech)

```ts
import { SpeechService } from '@mgvdev/nestjs-ai';

const { audio } = await this.speech.generate('Hello there', {
  model: 'openai:tts-1',
  voice: 'alloy',
  outputFormat: 'mp3',
});
```

## Transcription (speech-to-text)

```ts
import { TranscriptionService } from '@mgvdev/nestjs-ai';

const { text, segments } = await this.transcription.transcribe(audioBuffer, {
  model: 'openai:whisper-1',
});
```

`audio` accepts a `Uint8Array`, `ArrayBuffer`, `Buffer`, base64 string, or `URL`.

## Provider support

Availability depends on the provider SDK. OpenAI supports image, speech, and
transcription; other providers vary. A clear error is thrown when a configured
provider does not support the requested capability.
