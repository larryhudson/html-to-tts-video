function scrollToSpan(spanElem) {
  const spanRect = spanElem.getBoundingClientRect();

  const distanceFromTopOfScreen = spanRect.top;
  const windowHeight = window.innerHeight;

  if (distanceFromTopOfScreen + 200 > windowHeight) {
    window.scrollBy({
      left: 0,
      top: distanceFromTopOfScreen - windowHeight + windowHeight / 3,
      behavior: "smooth",
    });
  }

  if (distanceFromTopOfScreen < 100) {
    window.scrollBy({
      left: 0,
      top: distanceFromTopOfScreen - 150,
      behavior: "smooth",
    });
  }
}

window.addEventListener("load", function () {
  window.addEventListener("hashchange", function (event) {
    const FRAMES_PER_SECOND = 30;
    const frameNum = parseInt(
      location.hash.slice(1) // strip off the #
    );

    // reset
    const alreadyHighlighted = document.querySelectorAll("span.highlight");
    alreadyHighlighted.forEach(function (highlightedSpan) {
      highlightedSpan.classList.remove("highlight");
    });

    const currentTime = frameNum / FRAMES_PER_SECOND;

    const matchingTimingIndex = timings.findLastIndex(
      (t) => t.startTime <= currentTime
    );

    if (matchingTimingIndex) {
      const matchingSpan = document.querySelector(
        `span[data-timing-index="${matchingTimingIndex}"]`
      );

      scrollToSpan(matchingSpan);

      if (matchingSpan) {
        matchingSpan.classList.add("highlight");
      }
    }

    // control the page to look correct
  });
});
