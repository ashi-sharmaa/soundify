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

  // variables relevant to calibration
  let calibrateState = 0; // 0 == Not Calibrated, 1 == In progress, 2 == Complete
  let calibrationTime = 5;
  let calibrateStartTime = 0;
  let calibratedDistanceAverage = 0;
  let calibratedDistanceAverageRight = 0;
  let calibratedDistanceAverageLeft = 0;
  let calibratedNumPingsLeft = 0;
  let calibratedNumPingsRight = 0;


  // variables relevant to tapTracking
  let trackTapState = 0;  // 0 == Not tracking, 1 == Tracking 
                          // Use int rather than boolean in case more states are needed 
  let tapped = false;
  let leftTapped = false;
  let rightTapped = false;
  let minDistance = 0;
  let minDistanceRight = 0;
  let minDistanceLeft = 0;
  let minDistanceMultiplier = .25;

  // variables relevant to bar and cursor
  let piece1 = [];
  let barHeight = 50;
  let cursorDuration = 8_000;
  let cursorTimeStart = 0;
  let cursorPosition = 0;
  let leftAccuracy = 0;
  let pingLeft = 0;
  let rightAccuracy = 0;
  let pingRight = 0;

  let generateBlocks2 = false;

  var metronomeAudio = new Audio("met_120bpm.mp3");
  metronomeAudio.loop = false;
  var metronomeAudio2 = new Audio("Perc_Can_lo.wav");
  
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
  // const readCanvas = document.getElementById("read_canvas");
  // const readCanvasCtx = readCanvas.getContext("2d");
  
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
  async function enableCam(event) {
    piece1 = await generatePieceArray('piece1.txt');
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
    // console.log(piece1);
  
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

  // Starts the calibration state
  function beginCalibration(event) {
    if (webcamRunning == false) {
      console.log("Wait! webcam not running yet.");
      return;
    }
    console.log("calibrating!");
    calibrateButton.innerText = "CALIBRATING...";
    calibrateStartTime = Date.now();
    calibratedNumPingsLeft = 0;
    calibratedNumPingsRight = 0;
    calibratedDistanceAverage = 0;
    calibrateState = 1;
  }

  // Toggles Tap Tracking.
  function flipTapTracking(event) {
    if (calibrateState != 2) {
      console.log("Wait! calibration has not been completed.");
    }
    if (trackTapState == 0) {
      
      trackTapState = 1;
      trackTapsButton.innerText = "STOP TRACKING";
      leftAccuracy = 0;
      pingLeft = 0;
      rightAccuracy = 0;
      pingRight = 0;
      cursorPosition = 0;
      cursorTimeStart = Date.now();
      metronomeAudio.play();
      metronomeAudio.currentTime = 0;
    } else {
      trackTapState = 0;
      trackTapsButton.innerText = "TRACK TAPS";
      metronomeAudio.pause();
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

      // Calibration in Progress
      if (calibrateState == 1) {

        // Calibration ends. Using ms so that it is always 10_000 MS, 
        // and not any other time that rounds to 10_000 MS
        if (Date.now() > calibrateStartTime + calibrationTime * 1000) {
          calibrateState = 2;
          // calibratedDistanceAverage /= calibratedNumPings;
          // minDistance = calibratedDistanceAverage *= .25;
          calibratedDistanceAverageLeft /= calibratedNumPingsLeft;
          calibratedDistanceAverageRight /= calibratedNumPingsRight;
          console.log("LEFT: " + calibratedDistanceAverageLeft 
                    + "\nRIGHT: " + calibratedDistanceAverageRight);
          minDistanceLeft = calibratedDistanceAverageLeft * minDistanceMultiplier;
          minDistanceRight = calibratedDistanceAverageRight * minDistanceMultiplier;
          calibrateButton.innerText = "CALIBRATION COMPLETE";


        // Data collection for calibration
        } else {

          for (let i = 0; i < results.landmarks.length; i++) {
            let curHand = getSquaredDistance(results.landmarks[i], 4, 8);
            if (results.handednesses[i][0].categoryName == "Right") {
              calibratedDistanceAverageLeft += curHand;
              calibratedNumPingsLeft++;
            } else {
              calibratedDistanceAverageRight += curHand;
              calibratedNumPingsRight++;
            }
          }
          // calibratedDistanceAverage += getSquaredDistance(results.landmarks[0], 4, 8);
          // calibratedNumPings++;
          // console.log(calibratedNumPings);
        }
      }

      // Tracks Tapping
      if (trackTapState == 1) {

        for (let i = 0; i < results.landmarks.length; i++) {
          if (results.handednesses[i][0].categoryName == "Right") {
            if (leftTapped == true) {
              if (getSquaredDistance(results.landmarks[i], 4, 8) >= minDistanceLeft) {
                console.log("LEFT UNTAPPED: " + Date.now());
                leftTapped = false;
              }
            } else {
              if (getSquaredDistance(results.landmarks[i], 4, 8) < minDistanceLeft) {
                console.log("LEFT TAPPED: " + Date.now());
                leftTapped = true;
              }
            }
          } else {
            if (rightTapped == true) {
              if (getSquaredDistance(results.landmarks[i], 4, 8) >= minDistanceRight) {
                console.log("RIGHT UNTAPPED: " + Date.now());
                rightTapped = false;
              }
            } else {
              if (getSquaredDistance(results.landmarks[i], 4, 8) < minDistanceRight) {
                console.log("RIGHT TAPPED: " + Date.now());
                rightTapped = true;
              }
            }
          }
        }


      }

       for (const landmarks of results.landmarks) {
            // drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, {
            // color: "#00FF00",
            // lineWidth: 5
            // });

            drawLandmarks(canvasCtx, landmarks, { color: "#FF0000", lineWidth: 2 });
            // let x = getSquaredDistance(landmarks, 4, 8);
            // console.log(x);

            generateBlocks(piece1);
            if (trackTapState == 1) {
              advanceCursor();
            }
        }
    } 
    // canvasCtx.restore();

    function getSquaredDistance(landmark, index1, index2) {
      let xDiff = landmark[index1].x - landmark[index2].x;
      let yDiff = landmark[index1].y - landmark[index2].y;
      return xDiff * xDiff + yDiff * yDiff; 
    }

    function timeInSecs() {
      return Math.floor(Date.now() / 1000);
    }

    function generateBlocks(pieceArray) {
      // console.log("genBlocks");
      let curPix = 0;
      for (let i = 0; i < pieceArray.length; i++) {
        // console.log(pieceArray[i]);
        if (pieceArray[i] < 0) {
          let pieceLength = (video.videoWidth / 4) / (0 - pieceArray[i]);
          let pieceLength1 = pieceLength * .8;
          let pieceLength2 = pieceLength * .2;
          canvasCtx.fillStyle = "black";
          canvasCtx.fillRect(curPix, 0, curPix + pieceLength1, barHeight);
          canvasCtx.fillStyle = "blue";
          canvasCtx.fillRect(curPix + pieceLength1, 0, curPix + pieceLength1 + pieceLength2, barHeight);
          if (cursorPosition > curPix && cursorPosition < curPix + pieceLength1) {
            if (leftTapped == true) {
              leftAccuracy++;
            }
            pingLeft++;
            if (rightTapped == true) {
              rightAccuracy++;
            }
            pingRight++;
          } else if (cursorPosition > curPix + pieceLength1 && cursorPosition < curPix + pieceLength1 + pieceLength2) {
            if (leftTapped == false) {
              leftAccuracy++;
            }
            pingLeft++;
            if (rightTapped == false) {
              rightAccuracy++;
            }
            pingRight++;
          }
          curPix += pieceLength;
        } else {
          let pieceLength = (video.videoWidth / 4) / pieceArray[i];
          canvasCtx.fillStyle = "blue";
          canvasCtx.fillRect(curPix, 0, curPix + pieceLength, barHeight);
          if (cursorPosition > curPix && cursorPosition < curPix + pieceLength) {
            if (leftTapped == false) {
              leftAccuracy++;
            }
            pingLeft++;
            if (rightTapped == false) {
              rightAccuracy++;
            }
            pingRight++;
          }
          curPix += pieceLength;
        }
      }
      return true;
    }

    function advanceCursor() {
      let progress = (Date.now() - cursorTimeStart) / cursorDuration;
      // console.log(progress);
      if (progress > 1) {
        metronomeAudio.play();
        metronomeAudio.currentTime = 0;
        progress = 0;
        cursorTimeStart = Date.now();
        console.log("RIGHT ACCURACY: " + (rightAccuracy/pingRight));
        document.getElementById("right").textContent="Right Accuracy: " + (rightAccuracy/pingRight);
        pingRight = 0;
        rightAccuracy = 0;
        console.log("LEFT ACCURACY: " + (leftAccuracy/pingLeft));
        document.getElementById("left").textContent="Left Accuracy: " + (leftAccuracy/pingLeft);
        pingLeft = 0;
        leftAccuracy = 0;
      }
      cursorPosition = video.videoWidth * progress;
      canvasCtx.strokeStyle = "red";
      canvasCtx.lineWidth = 10;
      canvasCtx.beginPath();
      canvasCtx.moveTo(cursorPosition, 0);
      canvasCtx.lineTo(cursorPosition, barHeight);
      canvasCtx.stroke();
    }
    
  
    // Call this function again to keep predicting when the browser is ready.
    if (webcamRunning === true) {
      window.requestAnimationFrame(predictWebcam);
    }
}

async function generatePieceArray(inputFile) {
  let file = await fetch(inputFile);
  let text = await file.text();
  text = text.replace(/\r\n/g, ' ');
  let arr = text.split(' ');
  // console.log(arr);
  let arr2 = [];
  for (let i = 0; i < arr.length; i++) {
    arr2[i] = parseInt(arr[i]);
  }
  // console.log(arr2);
  return arr2;
}
  
  