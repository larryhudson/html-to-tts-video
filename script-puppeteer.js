// for rendering HTML and taking screenshots
const puppeteer = require("puppeteer");
const fs = require("fs");
const stream = require("stream");
const { spawn } = require("node:child_process");
const nodeStaticServer = require("node-static");
const http = require("http");

// for dealing with files

async function renderVideo() {
  const timings = await fs.promises.readFile("./timings.json").then(JSON.parse);

  const fileServer = new nodeStaticServer.Server("./11ty-output");

  const eleventyServer = http.createServer(function (request, response) {
    request
      .addListener("end", function () {
        fileServer.serve(request, response);
      })
      .resume();
  });

  eleventyServer.listen(5050);

  // set video options
  const FRAMES_PER_SECOND = 30;
  const VIDEO_HEIGHT = 720;
  const VIDEO_WIDTH = 1280;

  const VIDEO_DURATION = timings.at(-1).endTime;
  const TOTAL_NUM_FRAMES = VIDEO_DURATION * FRAMES_PER_SECOND;
  console.log("Video duration: ", VIDEO_DURATION);

  let currentFrame = 0;

  const browser = await puppeteer.launch();
  const browserPage = await browser.newPage();
  await browserPage.setViewport({
    width: 1280,
    height: 720,
  });

  await browserPage.goto("http://localhost:5050#0");

  // create the stream that we will write the image data to
  var imagesStream = new stream.PassThrough();

  const VIDEO_OUTPUT_PATH = `./video.mp4`;
  const AUDIO_TRACK_PATH = `./audio-track.mp3`;

  // create child process for ffmpeg with options
  var ffmpegProcess = spawn("ffmpeg", [
    "-y",
    "-f",
    "image2pipe",
    "-s",
    `${VIDEO_WIDTH}x${VIDEO_HEIGHT}`,
    "-framerate",
    FRAMES_PER_SECOND,
    // "-pix_fmt",
    // "yuv420p",
    "-i",
    "-",
    "-i",
    AUDIO_TRACK_PATH,
    "-vcodec",
    "libx264",
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

  let lastFrameContent;
  let lastFrameBuffer;

  // for each frame in the video
  while (currentFrame < TOTAL_NUM_FRAMES) {
    // for each frame, adjust the HTML to add the highlight to the current word

    await browserPage.goto(`http://localhost:5050/#${currentFrame}`);
    const pageContent = await browserPage.content();

    // let pngBuffer;

    const pngBuffer = await browserPage.screenshot({
      type: "jpeg",
      quality: 100,
    });

    // if (pageContent !== lastFrameContent) {

    // } else {
    //   pngBuffer = lastFrameBuffer;
    // }

    // write the PNG buffer to our image buffer
    imagesStream.write(pngBuffer, "utf-8");

    // console.log("done writing frame", currentFrame);
    lastFrameContent = pageContent;
    lastFrameBuffer = pngBuffer;
    currentFrame++;
  }

  // close the stream
  imagesStream.end();
  browser.close();
  eleventyServer.close();
}

module.exports = {
  renderVideo,
};
