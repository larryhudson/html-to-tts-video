require("dotenv").config();

const { convertHtmlToSpeech } = require("./utils/text-to-speech.js");
const { addSpansToHtml } = require("./utils/add-spans.js");
const { renderVideo } = require("./script-puppeteer.js");
const fs = require("fs");

module.exports = function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy({
    "11ty-assets": "assets",
  });

  eleventyConfig.addFilter("tts", async function (htmlContent) {
    const { audioBuffer, timings } = await convertHtmlToSpeech(htmlContent, {
      voiceName: "en-AU-WilliamNeural",
      resourceKey: process.env.AZURE_SPEECH_RESOURCE_KEY,
      region: process.env.AZURE_SPEECH_REGION,
      speed: "0%",
      lexiconUrl: null,
    });

    const AUDIO_TRACK_PATH = "./audio-track.mp3";
    const TIMINGS_JSON_PATH = "./timings.json";

    // write the audio buffer to an MP3 file
    await fs.promises.writeFile(AUDIO_TRACK_PATH, audioBuffer);
    await fs.promises.writeFile(
      TIMINGS_JSON_PATH,
      JSON.stringify(timings, null, 2)
    );

    return {
      withSpans: addSpansToHtml(htmlContent, timings),
      timings: timings,
    };
  });

  eleventyConfig.on("eleventy.after", renderVideo);

  return {
    dir: {
      input: "11ty-input",
      output: "11ty-output",
    },
  };
};
