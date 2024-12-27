import {
  PoseLandmarker,
  FilesetResolver,
} from "https://cdn.skypack.dev/@mediapipe/tasks-vision@0.10.0";

const ROUND_DURATION = 10000;
const THRESHOLDS = {
  headTilt: 0.15, // radians
  shoulderAlignment: 10, // pixels
  forwardDistance: 50,
  faceSize: 100,
};
const POSTURE_CORRECT_INCORRECT_FACTOR = 4;

const MARKER_COLOR = "hsla(156, 71.00%, 50.00%, 0.99)";

(async () => {
  const video = document.getElementById("video");

  const outputCanvas = document.getElementById("outputCanvas");
  const ctx = outputCanvas.getContext("2d");

  const playPauseButton = document.getElementById("play-pause-button");
  const notificationsButton = document.getElementById("notifications-button");
  const hourglassButton = document.getElementById("hourglass-button");

  const playPauseIcon = document.getElementById("play-pause-icon");
  const notificationsIcon = document.getElementById("notifications-icon");
  const hourglassIcon = document.getElementById("hourglass-icon");

  const infoButton = document.getElementById("info-icon");
  const faqButton = document.getElementById("faq-icon");

  let cameraActive = false;
  let notificationsEnabled = false;
  let browserNotificationsEnabled = false;

  let checkInterval = 0;
  let checkIntervalTimeoutId = null;

  const notificationSound = new Audio("./sounds/notification-sound.wav");

  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
  );

  const poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: "./models/pose_landmarker_full.task",
      delegate: "GPU",
    },
    runningMode: "VIDEO",
  });

  window.setCheckInterval = () => {
    const intervalOptions = document.getElementById("interval-options");
    const selectedInterval = intervalOptions.querySelector(
      'input[name="interval"]:checked'
    ).value;
    checkInterval = parseInt(selectedInterval, 10) || 0;
    hourglassIcon.className =
      checkInterval > 0 ? "ri-hourglass-fill" : "ri-hourglass-line";

    if (!cameraActive) {
      playPauseButton.click();
    }
    toggleModal("hourglass-modal");
  };

  let lastVideoTime = -1;
  let correctFrames = 0;
  let incorrectFrames = 0;
  let startTime = null;

  const updateRoundStartTime = () => {
    correctFrames = 0;
    incorrectFrames = 0;
    startTime = performance.now();
  };

  const stopVideo = () => {
    playPauseIcon.className = "ri-play-large-line";
    cameraActive = false;
    video.pause();
    video.srcObject.getTracks().forEach((track) => track.stop());
  };

  async function detectPosture() {
    if (!poseLandmarker) {
      console.log("Wait! poseLandmaker not loaded yet.");
      return;
    }

    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;

    let currentTimeMs = performance.now();
    if (startTime === null) {
      startTime = currentTimeMs;
    }

    if (lastVideoTime !== video.currentTime) {
      lastVideoTime = video.currentTime;
      poseLandmarker.detectForVideo(video, currentTimeMs, (result) => {
        if (result.landmarks.length === 1) {
          const { correct, metrics, reasons } = isPostureCorrect(
            result.landmarks[0].map((point) => [
              point.x * videoWidth,
              point.y * videoHeight,
            ])
          );

          // console.log("Metrics:", metrics, "Reasons:", reasons);
          if (correct) {
            correctFrames++;
            // console.log("Posture is correct!");
          } else {
            incorrectFrames++;
            // console.log("Posture is incorrect!");
          }

          ctx.save();
          ctx.clearRect(0, 0, outputCanvas.width, outputCanvas.height);
          for (const landmark of result.landmarks) {
            landmark.forEach((point) => {
              drawCircle(
                ctx,
                point.x * outputCanvas.width,
                point.y * outputCanvas.height
              );
            });
          }
          ctx.restore();
        } else {
          correctFrames = 0;
          incorrectFrames = 0;
          startTime = null;
        }
      });
    }

    if (currentTimeMs - startTime >= ROUND_DURATION) {
      if (incorrectFrames * POSTURE_CORRECT_INCORRECT_FACTOR > correctFrames) {
        console.log("Posture is incorrect!");
        if (browserNotificationsEnabled) {
          const notification = new Notification("Posture Check", {
            body: "Keep Straight!",
          });

          setTimeout(() => {
            notification.close();
          }, ROUND_DURATION - 500);
        }
        if (notificationsEnabled) notificationSound.play();
      }

      correctFrames = 0;
      incorrectFrames = 0;
      startTime = currentTimeMs;

      if (checkInterval !== 0) {
        stopVideo();
        checkIntervalTimeoutId = setTimeout(() => {
          if (!cameraActive) {
            playPauseButton.click();
          }
        }, checkInterval * 1000);
      }
    }

    if (cameraActive === true) {
      window.requestAnimationFrame(detectPosture);
    }
  }

  // Modals
  window.toggleModal = (modalId) => {
    const modal = document.getElementById(modalId);

    if (modal.style.display === "flex") {
      modal.classList.add("closing");
      setTimeout(() => {
        modal.style.display = "none"; // Hide the modal after animation
        modal.classList.remove("closing"); // Remove the closing class
      }, 300);
    } else {
      modal.style.display = "flex"; // Show modal
      setTimeout(() => {
        modal.classList.add("show"); // Trigger opening animation
      }, 10);
    }
  };

  window.addEventListener("click", (event) => {
    const modals = document.querySelectorAll(".modal");
    modals.forEach((modal) => {
      const modalContent = modal.querySelector(".modal-content");
      if (
        modal.style.display !== "none" &&
        event.target !== modal &&
        !modalContent.contains(event.target)
      ) {
        toggleModal(modal.id); // Close the modal if the click is outside the modal content
      }
    });
  });

  // Event Listeners
  const hasGetUserMedia = () => !!navigator.mediaDevices?.getUserMedia;
  if (hasGetUserMedia()) {
    playPauseButton.addEventListener("click", async () => {
      cameraActive = !cameraActive;

      if (cameraActive) {
        clearTimeout(checkIntervalTimeoutId);
        updateRoundStartTime();
        playPauseIcon.className = "ri-pause-large-line";
        navigator.mediaDevices
          .getUserMedia({
            video: true,
          })
          .then((stream) => {
            video.srcObject = stream;
            video.addEventListener("loadeddata", detectPosture);
          });
      } else stopVideo();
    });
  } else {
    console.warn("getUserMedia() is not supported by your browser");
    alert("getUserMedia() is not supported by your browser");
  }

  notificationsButton.addEventListener("click", () => {
    if (
      window.location.protocol === "https:" ||
      window.location.hostname === "localhost"
    ) {
      if (Notification.permission !== "granted")
        Notification.requestPermission((result) => {
          if (result === "granted")
            browserNotificationsEnabled = !browserNotificationsEnabled;
          notificationsIcon.className = browserNotificationsEnabled
            ? "ri-notification-2-fill"
            : "ri-notification-2-line";
        });
      else browserNotificationsEnabled = !browserNotificationsEnabled;
    } else notificationsEnabled = !notificationsEnabled;

    if (notificationsEnabled || browserNotificationsEnabled) {
      notificationsIcon.className = "ri-notification-2-fill";
      notificationSound.play();
    } else notificationsIcon.className = "ri-notification-2-line";
  });

  hourglassButton.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleModal("hourglass-modal");
  });

  infoButton.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleModal("info-modal");
  });

  faqButton.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleModal("faq-modal");
  });

  faqButton.click();
})();

function isPostureCorrect(points) {
  const nose = points[0];
  const rightEye = points[2]; // changed order of eyes bacause of mirroring
  const leftEye = points[5];
  const leftShoulder = points[11];
  const rightShoulder = points[12];

  //console.log("Nose:", nose, "Left Eye:", leftEye, "Right Eye:", rightEye);

  // 1. Head Tilt: Angle between eyes and horizontal
  const headTilt = Math.abs(
    Math.atan2(rightEye[1] - leftEye[1], rightEye[0] - leftEye[0])
  );

  // 2. Shoulder Alignment: Vertical distance between shoulders
  const shoulderAlignment = Math.abs(leftShoulder[1] - rightShoulder[1]);

  // 3. Forward Head Posture: Horizontal distance between nose and midpoint of shoulders
  const shoulderMidX = (leftShoulder[0] + rightShoulder[0]) / 2;
  const forwardDistance = Math.abs(nose[0] - shoulderMidX);

  const faceSize = Math.abs(rightEye[0] - leftEye[0]);

  const isHeadStraight = headTilt < THRESHOLDS.headTilt;
  const areShouldersAligned = shoulderAlignment < THRESHOLDS.shoulderAlignment;
  const isNotLeaningForward = forwardDistance < THRESHOLDS.forwardDistance;
  const isNotTooClose = faceSize < THRESHOLDS.faceSize;

  return {
    correct:
      isHeadStraight &&
      areShouldersAligned &&
      isNotLeaningForward &&
      isNotTooClose,
    metrics: {
      headTilt: headTilt,
      shoulderAlignment,
      forwardDistance,
      faceSize,
    },
    reasons: {
      headStraight: isHeadStraight,
      shouldersAligned: areShouldersAligned,
      notLeaningForward: isNotLeaningForward,
      notTooClose: isNotTooClose,
    },
  };
}

function drawCircle(ctx, x, y) {
  ctx.beginPath();
  ctx.arc(x, y, 1, 0, 2 * Math.PI);
  ctx.fillStyle = MARKER_COLOR;
  ctx.fill();
  ctx.closePath();
}
