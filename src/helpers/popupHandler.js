// Function for the toggle public status
function updatePublicStatus() {
  const toggle = document.getElementById('publicToggle');
  document.getElementById('publicStatus').value = toggle.checked ? 'true' : 'false';
  console.log('Public status changed to:', document.getElementById('publicStatus').value); // Debug log
}
// Function to toggle popup visibility within the button
function togglePopup(popupId) {
  var popup = document.getElementById(popupId);
  
  // If already shown, hide it with animation
  if (popup.classList.contains('show')) {
    popup.classList.remove('show');
    popup.classList.add('hide');
    setTimeout(function() {
      popup.classList.remove('hide');
      popup.style.display = 'none'; // Ensure it disappears after animation
    }, 300); // Match the animation duration
  } else {
    // Hide other popups before showing the new one
    document.querySelectorAll('.popup').forEach(p => {
      p.classList.remove('show');
      p.style.display = 'none';
    });
    
    popup.style.display = 'block';
    popup.classList.add('show');
  }
}

// Prevent button click from closing the popup when interacting with the popup content
function stopPropagation(e) {
  e.stopPropagation();
}

// Event listeners for buttons
document.getElementById("text-btn").onclick = function() {
  togglePopup('textPopup');
};

document.getElementById("record-btn").onclick = function() {
  togglePopup('recordPopup');
};

document.getElementById("upload-btn").onclick = function() {
  togglePopup('uploadPopup');
};

// Attach event listener to stop clicks inside the popup from closing it
document.querySelectorAll('.popup').forEach(popup => {
  popup.onclick = stopPropagation;
});

// Function to update the timer (used for recording)
function updateTimer(secondsLeft, timerElementId) {
  const timerElement = document.getElementById(timerElementId);
  
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  
  timerElement.innerText = 
    (minutes < 10 ? '0' : '') + minutes + ':' + (seconds < 10 ? '0' : '') + seconds;
}

// Function to handle recording timeline
function updateProgress(duration, progressId) {
  let progress = document.getElementById(progressId);
  let width = 0;
  const interval = setInterval(() => {
    if (width >= 100) {
      clearInterval(interval);
    } else {
      width += 100 / (duration * 10); // Update based on duration (100 updates per duration)
      progress.style.width = width + '%';
    }
  }, 100); // Update every 100ms

  return interval; // Return the interval to stop it later
}

// Voice Recording logic with 3-minute limit (180 seconds)
let mediaRecorder;
let audioChunks = [];
let mediaStream = null; // Keep track of the media stream
let recordingDuration = 180; // Maximum recording duration in seconds (3 minutes)
let timerInterval = null;
let progressInterval = null;
let audioPlaybackElement = document.getElementById("audioPlayback");

// Function to stop the media stream (stops browser recording icon)
function stopMediaStream() {
  if (mediaStream) {
    const tracks = mediaStream.getTracks();
    tracks.forEach(track => track.stop());  // Stop all media tracks
    mediaStream = null;
  }
}

// Function to stop the media recorder
function stopRecording() {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    console.log("Stopping media recorder...");
    mediaRecorder.stop();  // Stop the media recorder
  }

  stopMediaStream();  // Stop the media stream to remove recording icon
  document.getElementById("startRecord").disabled = false;
  document.getElementById("stopRecord").disabled = true;
  clearInterval(timerInterval); // Stop the timer
  clearInterval(progressInterval); // Stop the progress bar
}

document.getElementById("startRecord").onclick = function() {
  navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
    mediaStream = stream; // Store the media stream for later stopping
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];  // Reset the audio chunks for each recording

    console.log("Starting media recorder...");
    mediaRecorder.start();
    document.getElementById("startRecord").disabled = true;
    document.getElementById("stopRecord").disabled = false;

    let secondsElapsed = 0;

    // Start updating progress bar for 180 seconds of recording
    progressInterval = updateProgress(recordingDuration, 'recordProgress');
    
    // Timer for recording (increment seconds)
    timerInterval = setInterval(() => {
      secondsElapsed++;
      updateTimer(secondsElapsed, 'recordTimer');

      // Automatically stop after 3 minutes (180 seconds)
      if (secondsElapsed >= recordingDuration) {
        stopRecording();
      }
    }, 1000); // Update every second

    mediaRecorder.ondataavailable = function(event) {
      audioChunks.push(event.data);  // Add each chunk of audio data
    };

    mediaRecorder.onstop = function() {
      console.log("Media recorder stopped.");
  
      const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
  
      // Convert the Blob to a base64 string or URL if necessary (for now, use Blob)
      const reader = new FileReader();
      reader.onloadend = function() {
          const base64String = reader.result; // Store the base64 data
          document.getElementById('voiceUploadData').value = base64String;
      };
      reader.readAsDataURL(audioBlob); // Read the Blob as data URL
  
      // Reset progress bar
      document.getElementById('recordProgress').style.width = '0%';
  };
  
  }).catch(error => {
    console.error("Error accessing microphone:", error);
  });
};

document.getElementById("stopRecord").onclick = stopRecording;

document.addEventListener('DOMContentLoaded', function() {
  // Handle form submission when the check button is clicked
  document.getElementById('editLabelForm').onsubmit = function(event) {
      console.log('Form submitted');
      
      // Get form values
      const title = document.getElementById('titel12').value;
      const textMemo = document.getElementById('textMemo').value;
      const publicStatus = document.getElementById('publicStatus').value;
      const voiceFile = document.getElementById('voiceUploadData').value;
      const imageFile = document.getElementById('imageUpload').files[0];

      console.log('Title:', title);
      console.log('Text Memo:', textMemo);
      console.log('Public Status:', publicStatus);
      console.log('Voice Memo File:', voiceFile);
      console.log('Image Upload File:', imageFile);

      // Validation: Prevent submission if both text and image memo are provided
      if (textMemo && imageFile) {
          event.preventDefault();  // Stop form submission
          alert('Please only add one type of memo (either text or image, but not both).');
          return;  // Exit the function to prevent further actions
      }

      // Validation: Prevent submission if both text and voice memo are provided
      if (textMemo && voiceFile) {
          event.preventDefault();  // Stop form submission
          alert('Please only add one type of memo (either text or voice, but not both).');
          return;  // Exit the function to prevent further actions
      }

      // Validation: Prevent submission if both image and voice memo are provided
      if (imageFile && voiceFile) {
          event.preventDefault();  // Stop form submission
          alert('Please only add one type of memo (either image or voice, but not both).');
          return;  // Exit the function to prevent further actions
      }
  };
});

