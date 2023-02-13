---
layout: layout.njk
---

# Creating a video with Puppeteer and ffmpeg

To create this video, I:

- generated an audio version with Azure text to speech
- generated a static webpage with Eleventy
- wrote an event handler for the 'hashchange' event, which would allow me to manipulate the HTML, based on the current frame number
- made Puppeteer load the webpage, and then increment the hash (eg. #1, #2, #3), and take a screenshot at each frame
- pipe the Puppeteer screenshots into ffmpeg, which generates the video.
