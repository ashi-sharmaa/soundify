// Copyright 2023 The MediaPipe Authors.

// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at

//      http://www.apache.org/licenses/LICENSE-2.0

// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import {
    HandLandmarker,
    FilesetResolver
  } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0";
  
  const demosSection = document.getElementById("demos");
  
  let handLandmarker = undefined;
  let runningMode = "IMAGE";
  let enableWebcamButton = HTMLButtonElement;
  let calibrateButton = HTMLButtonElement;
  let trackTapsButton = HTMLButtonElement;
  let webcamRunning = false;


  let calibrateState = 0;
  let calibrationTime = 5;
  let calibrateStartTime = 0;
  let calibratedDistanceAverage = 0;
  let calibratedNumPings = 0;

  let trackTapState = 0;
  let tapped = false;
  let minDistance = 0;
  
  // Before we can use HandLandmarker class we must wait for it to finish
  // loading. Machine Learning models can be large and take a moment to
  // get everything needed to run.
  const createHandLandmarker = async () => {
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
    );
    handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
        delegate: "GPU"
      },
      runningMode: runningMode,
      numHands: 2
    });
    demosSection?.classList.remove("invisible");
  };
  createHandLandmarker();
  
  
  /********************************************************************
  // Demo 2: Continuously grab image from webcam stream and detect it.
  ********************************************************************/
  
  const video = document.getElementById("webcam");
  const canvasElement = document.getElementById(
    "output_canvas"
  );
  const canvasCtx = canvasElement.getContext("2d");
  
  // Check if webcam access is supported.
  const hasGetUserMedia = () => !!navigator.mediaDevices?.getUserMedia;
  
  // If webcam supported, add event listener to button for when user
  // wants to activate it.
  if (hasGetUserMedia()) {
    enableWebcamButton = document.getElementById("webcamButton");
    enableWebcamButton.addEventListener("click", enableCam);

    calibrateButton = document.getElementById("calibrateButton");
    calibrateButton.addEventListener("click", beginCalibration);

    trackTapsButton = document.getElementById("trackTapsButton");
    trackTapsButton.addEventListener("click", flipTapTracking);
    
  } else {
    console.warn("getUserMedia() is not supported by your browser");
  }
  
  // Enable the live webcam view and start detection.
  function enableCam(event) {
    if (!handLandmarker) {
      console.log("Wait! objectDetector not loaded yet.");
      return;
    }
  
    if (webcamRunning === true) {
      webcamRunning = false;
      enableWebcamButton.innerText = "ENABLE PREDICTIONS";
    } else {
      webcamRunning = true;
      enableWebcamButton.innerText = "DISABLE PREDICTIONS";
    }
  
    // getUsermedia parameters.
    const constraints = {
      video: true
    };
  
    // Activate the webcam stream.
    navigator.mediaDevices.getUserMedia(constraints).then((stream) => {
      video.srcObject = stream;
      video.addEventListener("loadeddata", predictWebcam);
    });
  }

  function beginCalibration(event) {
    if (webcamRunning == false) {
      console.log("Wait! webcam not running yet.");
      return;
    }

    calibrateState = 1;
  }

  function flipTapTracking(event) {
    if (trackTapState == false) {
      trackTapState = true;
      trackTapsButton.innerText = "STOP TRACKING";
    } else {
      trackTapState = false;
      trackTapsButton.innerText = "TRACK TAPS";
    }
  }
  
  let lastVideoTime = -1;
  let results = undefined;
  console.log(video);
  async function predictWebcam() {
    canvasElement.style.width = video.videoWidth;;
    canvasElement.style.height = video.videoHeight;
    canvasElement.width = video.videoWidth;
    canvasElement.height = video.videoHeight;
    
    // Now let's start detecting the stream.
    if (runningMode === "IMAGE") {
      runningMode = "VIDEO";
      await handLandmarker.setOptions({ runningMode: "VIDEO" });
    }
    let startTimeMs = performance.now();
    if (lastVideoTime !== video.currentTime) {
      lastVideoTime = video.currentTime;
      results = handLandmarker.detectForVideo(video, startTimeMs);
    }
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    if (results.landmarks) {

      if (calibrateState == 1) {
        console.log("calibrating!");
        calibrateStartTime = Date.now();
        calibrateState = 2;
        calibratedNumPings = 0;
        calibratedDistanceAverage = 0;
      } 

      if (calibrateState == 2) {
        if (Date.now() > calibrateStartTime + calibrationTime * 1000) {
          calibrateState = 3;
          calibratedDistanceAverage /= calibratedNumPings;
          minDistance = calibratedDistanceAverage *= .25;
          console.log(calibratedDistanceAverage);
        } else {
          calibratedDistanceAverage += getSquaredDistance(results.landmarks[0], 4, 8);
          calibratedNumPings++;
          console.log(calibratedNumPings);
        }
      }

      if (trackTapState == true) {
        if (tapped == false) {
          if (getSquaredDistance(results.landmarks[0], 4, 8) < minDistance) {
            console.log("Tapped! " + Date.now());
            tapped = true;
          }
        } else {
          if (getSquaredDistance(results.landmarks[0], 4, 8) >= minDistance) {
            tapped = false;
          }
        }
      }

       for (const landmarks of results.landmarks) {
            drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, {
            color: "#00FF00",
            lineWidth: 5
            });

            drawLandmarks(canvasCtx, landmarks, { color: "#FF0000", lineWidth: 2 });
            // let x = getSquaredDistance(landmarks, 4, 8);
            // console.log(x);
        }
    } 
     

    // CALIBRATION
    // tell user to show hands for 10 seconds
    // for hall seconds, get average hand width 

    // let tapped = false; 
    // let minRadius = getSquaredDistance(landmarks[0], 4, 8);
   

    canvasCtx.restore();

    // function calibrate() {
    //   start = Date.now();
    //   tDistTotal = 0;
    //   numPings = 0;
    //   while (Date.now() < start + 10_000) {
        
    //   }

    // }

    function getSquaredDistance(landmark, index1, index2) {
      let xDiff = landmark[index1].x - landmark[index2].x;
      let yDiff = landmark[index1].y - landmark[index2].y;
      return xDiff * xDiff + yDiff * yDiff; 
    }

    function timeInSecs() {
      return Math.floor(Date.now() / 1000);
    }
    
  
    // Call this function again to keep predicting when the browser is ready.
    if (webcamRunning === true) {
      window.requestAnimationFrame(predictWebcam);
    }
}
  
  