// initialise env variables
import * as dotenv from "dotenv";
dotenv.config();

// for manipulating HTML
import cheerio from "cheerio";

// for converting HTML to SVG, then SVG to PNG
import satori from "satori";
import { html as satoriHtml } from "satori-html";
import { Resvg } from "@resvg/resvg-js";

// for dealing with files
import fs from "fs";
import stream from "stream";
import { spawn } from "node:child_process";

// utils for text to speech
import { convertHtmlToSpeech } from "./utils/text-to-speech.mjs";
import { addSpansToHtml } from "./utils/add-spans.mjs";

function applyStylesToHtml(html) {
  const $ = cheerio.load(html);

  const contentDiv = $(".content");

  $(contentDiv).css("display", "flex");
  $(contentDiv).css("align-items", "center");
  $(contentDiv).css("justify-content", "center");
  $(contentDiv).css("height", "480px");
  $(contentDiv).css("width", "640px");
  $(contentDiv).css("font-family", "Roboto");
  $(contentDiv).css("font-size", "24px");

  $("span").css("margin-right", "5px");

  return $.html();
}

async function main() {
  const textContent = "I am creating a video with HTML";

  const htmlContent = `<div class="content"><p>${textContent}</p></div>`;

  // convert the HTML to audio - get the audio buffer and the timings
  const { audioBuffer, timings } = await convertHtmlToSpeech(htmlContent, {
    voiceName: "en-AU-WilliamNeural",
    resourceKey: process.env.AZURE_SPEECH_RESOURCE_KEY,
    region: process.env.AZURE_SPEECH_REGION,
    speed: "0%",
    lexiconUrl: null,
  });

  const AUDIO_TRACK_PATH = "./audio-track.mp3";

  // write the audio buffer to an MP3 file
  await fs.promises.writeFile(AUDIO_TRACK_PATH, audioBuffer);

  // use the timings data to create 'span' elements in HTML content
  const htmlContentWithSpans = addSpansToHtml(htmlContent, timings);

  // apply inline styles to the HTML
  const htmlContentWithStyledSpans = applyStylesToHtml(htmlContentWithSpans);

  // set video options
  const FRAMES_PER_SECOND = 30;
  const VIDEO_HEIGHT = 480;
  const VIDEO_WIDTH = 640;

  const TOTAL_NUM_FRAMES = timings.at(-1).endTime * FRAMES_PER_SECOND;

  let currentFrame = 0;

  function getTimeForFrame(frameNum) {
    return frameNum / FRAMES_PER_SECOND;
  }

  // create the stream that we will write the image data to
  var imagesStream = new stream.PassThrough();

  const VIDEO_OUTPUT_PATH = `./video.mp4`;

  // create child process for ffmpeg with options
  var ffmpegProcess = spawn("ffmpeg", [
    "-y",
    "-f",
    "image2pipe",
    "-s",
    `${VIDEO_WIDTH}x${VIDEO_HEIGHT}`,
    "-framerate",
    FRAMES_PER_SECOND,
    "-pix_fmt",
    "yuv420p",
    "-i",
    "-",
    "-i",
    AUDIO_TRACK_PATH,
    "-vcodec",
    "mpeg4",
    "-shortest",
    VIDEO_OUTPUT_PATH,
  ]);

  ffmpegProcess.stdout.on("data", (data) => console.log(data.toString()));
  ffmpegProcess.stderr.on("data", (data) => console.log(data.toString()));
  ffmpegProcess.on("close", (code) => {
    console.log(`done writing video! (${code})`);
  });

  // the images will be piped into the ffmpeg input
  imagesStream.pipe(ffmpegProcess.stdin);

  const robotoFontBuffer = await fs.promises.readFile("./Roboto-Regular.ttf");

  // for each frame in the video
  while (currentFrame < TOTAL_NUM_FRAMES) {
    // for each frame, adjust the HTML to add the highlight to the current word
    let $ = cheerio.load(htmlContentWithStyledSpans);

    const currentTime = getTimeForFrame(currentFrame);
    console.log({ currentTime });

    const timingIndex = timings.findIndex(
      (t) => t.startTime < currentTime && t.endTime > currentTime
    );

    if (timingIndex) {
      console.log("timing index equals", timingIndex);
      $(`span[data-timing-index="${timingIndex}"]`).css(
        "background-color",
        "yellow"
      );
    }

    // console.log($.html());

    const htmlToRender = $.html();

    // create SVG
    const svgToRender = await satori(satoriHtml(htmlToRender), {
      width: 640,
      height: 480,
      // embedFont: false,
      fonts: [
        {
          name: "Roboto",
          data: robotoFontBuffer,
          weight: 400,
          style: "normal",
        },
      ],
    });

    // convert the SVG to PNG
    const reSvgOptions = {
      background: "#ffffff",
      fitTo: {
        mode: "width",
        value: 640,
      },
      font: {
        fontFiles: ["./Roboto-Regular.ttf"], // Load custom fonts.
        loadSystemFonts: false, // It will be faster to disable loading system fonts.
        defaultFontFamily: "Roboto",
      },
      imageRendering: 1,
      shapeRendering: 2,
      logLevel: "debug", // Default Value: error
    };

    const resvg = new Resvg(svgToRender, reSvgOptions);
    const pngData = resvg.render();
    const pngBuffer = pngData.asPng();

    // write the PNG buffer to our image buffer
    imagesStream.write(pngBuffer, "utf-8");

    console.log("done writing frame", currentFrame);
    currentFrame++;
  }

  // close the stream
  imagesStream.end();
}

main();
