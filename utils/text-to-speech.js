const {
  SpeechConfig,
  SpeechSynthesisOutputFormat,
  AudioConfig,
  SpeechSynthesizer,
} = require("microsoft-cognitiveservices-speech-sdk");

const { AssetCache } = require("@11ty/eleventy-fetch");
const md5 = require("js-md5");
const { join } = require("path");
const { encode } = require("html-entities");
const { convert: htmlToText } = require("html-to-text");
const fs = require("fs");

function chunkText(text) {
  const MAX_CHUNK_LENGTH = 7000;

  const textLines = text.split("\n");

  let chunks = [];
  let currentChunkLines = [];

  textLines.forEach((lineText) => {
    const currentChunkLength = currentChunkLines.join("\n").length;

    if (currentChunkLength > MAX_CHUNK_LENGTH) {
      chunks.push(currentChunkLines.join("\n"));
      currentChunkLines = [];
    } else {
      currentChunkLines.push(lineText);
    }
  });
  if (currentChunkLines.length > 0) chunks.push(currentChunkLines.join("\n"));

  return chunks;
}

async function convertTextChunkToSpeech(text, options) {
  // Check cache for generated audio based on unique hash of text content
  const textHash = md5(text);

  let cachedAudio = new AssetCache(`audio_${textHash}`);
  let cachedTimings = new AssetCache(`timing_${textHash}`);

  if (cachedAudio.isCacheValid("365d")) {
    console.log(`[text-to-speech] Using cached MP3 data for hash ${textHash}`);

    const audio = await cachedAudio.getCachedValue();
    const timings = await cachedTimings.getCachedValue();

    return {
      audio,
      timings,
    };
  } else {
    console.log(
      `[text-to-speech] Asking Microsoft API to generate MP3 for hash ${textHash}`
    );
  }

  // Setup Azure Text to Speech API

  if (!options.resourceKey)
    throw new Error(
      `[text-to-speech] resourceKey is not set in the text to speech options.\n Either add the environment variable AZURE_SPEECH_RESOURCE_KEY or set 'resourceKey' in the 'textToSpeech' options when adding the plugin`
    );

  if (!options.region)
    throw new Error(
      `[text-to-speech] region is not set in the text to speech options.\n Either add the environment variable AZURE_SPEECH_REGION or set 'region' in the 'textToSpeech' options when adding the plugin`
    );

  const speechConfig = SpeechConfig.fromSubscription(
    options.resourceKey,
    options.region
  );

  speechConfig.speechSynthesisLanguage = options.voiceName.slice(0, 5);
  speechConfig.speechSynthesisVoiceName = options.voiceName;
  speechConfig.speechSynthesisOutputFormat =
    SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3;

  const TMP_FOLDER_NAME = `.tmp-text-to-speech`;

  //   TODO: write hook to delete the temp folder after build
  if (!fs.existsSync(TMP_FOLDER_NAME)) {
    fs.mkdirSync(TMP_FOLDER_NAME);
  }

  const tmpFilePath = join(TMP_FOLDER_NAME, `${textHash}.mp3`);

  const audioConfig = AudioConfig.fromAudioFileOutput(tmpFilePath);

  const synthesizer = new SpeechSynthesizer(speechConfig, audioConfig);

  const timings = [];

  synthesizer.wordBoundary = (_, event) => {
    const startTime = event.privAudioOffset * 0.0000001;
    const startTimeRounded = parseFloat(startTime.toFixed(5));
    const endTime = (event.privAudioOffset + event.privDuration) * 0.0000001;
    const endTimeRounded = parseFloat(endTime.toFixed(5));

    timings.push({
      startTime: startTimeRounded,
      endTime: endTimeRounded,
      text: event.privText.trim(), // trim the text in case it starts with a space (that will trip up when adding spans)
    });
  };

  // Generate MP3 with Azure API

  const audioArrayBuffer = await new Promise((resolve, reject) => {
    const encodedText = encode(text);

    const ssmlText = `<speak xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="http://www.w3.org/2001/mstts" xmlns:emo="http://www.w3.org/2009/10/emotionml" version="1.0" xml:lang="${options.voiceName.slice(
      0,
      5
    )}">
        <voice name="${options.voiceName}">
        ${options.lexiconUrl ? `<lexicon uri="${options.lexiconUrl}" />` : ""}
        <prosody rate="${options.speed}" pitch="0%">
        ${encodedText}
        </prosody>
        </voice>
        </speak>`;

    synthesizer.speakSsmlAsync(
      ssmlText,
      async (result) => {
        synthesizer.close();
        if (result) {
          resolve(result.privAudioData);
        } else {
          reject(result);
        }
      },
      (error) => {
        console.log(`[text-to-speech] Error while generating MP3`);
        synthesizer.close();
        throw new Error(error);
      }
    );
  });

  const audio = Buffer.from(audioArrayBuffer);

  await cachedAudio.save(audio, "buffer");
  await cachedTimings.save(timings, "json");

  return {
    audio,
    timings,
  };
}

async function convertHtmlToSpeech(htmlContent, options) {
  const text = htmlToText(htmlContent, {
    wordwrap: 0,
    selectors: [
      { selector: "h1", options: { uppercase: false } },
      { selector: "h2", options: { uppercase: false } },
      { selector: "h2", options: { uppercase: false } },
      { selector: "h3", options: { uppercase: false } },
      { selector: "h4", options: { uppercase: false } },
      { selector: "ul", options: { itemPrefix: " " } },
    ],
  });

  // chunk text
  const chunks = chunkText(text);

  const audioAndTimings = await Promise.all(
    chunks.map((chunk) => convertTextChunkToSpeech(chunk, options))
  );

  const audioBuffers = audioAndTimings.map(
    (audioAndTiming) => audioAndTiming.audio
  );
  const timingsArrays = audioAndTimings.map(
    (audioAndTiming) => audioAndTiming.timings
  );

  return {
    audioBuffer: Buffer.concat(audioBuffers),
    timings: timingsArrays.flat(),
  };
}

module.exports = {
  convertHtmlToSpeech,
};
