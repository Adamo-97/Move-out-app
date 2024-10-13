document.addEventListener('DOMContentLoaded', function () {
    let mediaRecorder;
    let audioChunks = [];
    let audioBlob; // Store the recorded audio
    let stream;
    let timerInterval;
    let maxRecordingTime = 180; // 3 minutes in seconds
    let elapsedTime = 0;

    // Extract query parameters from the URL
    const urlParams = new URLSearchParams(window.location.search);
    const labelName = urlParams.get('titel114') || urlParams.get('titel113') || urlParams.get('titel112');
    const categoryId = urlParams.get('category_id');
    const publicStatus = urlParams.get('public'); 

    // Define selectors for General, Fragile, and Hazard buttons/timelines, etc.
    const selectors = {
        3: {  // General
            startButton: document.querySelector('.play-button-AFDyxE'),
            stopButton: document.querySelector('.stop-button-AFDyxE'),
            checkButton: document.getElementById('check-button'), 
            timerDisplay: document.querySelector('.timer-AFDyxE .x0000-3FzQFZ'),
            timelineProgress: document.querySelector('.timeline-progress-Jx4Dnz'),
            titleInput: document.querySelector('[name="titel110"]'), 
            postUrl: '/general-voice' 
        },
        1: {  // Fragile
            startButton: document.querySelector('.play-button-AmHt9d'),
            stopButton: document.querySelector('.stop-button-AmHt9d'),
            checkButton: document.getElementById('check-button'), 
            timerDisplay: document.querySelector('.timer-AmHt9d .x0000-3aCixq'),
            timelineProgress: document.querySelector('.timeline-progress-VZnbhB'),
            titleInput: document.querySelector('[name="titel17"]'), 
            postUrl: '/fragile-voice' 
        },
        2: {  // Hazard
            startButton: document.querySelector('.play-button-drX7Up'),
            stopButton: document.querySelector('.stop-button-drX7Up'),
            checkButton: document.getElementById('check-button'), 
            timerDisplay: document.querySelector('.timer-drX7Up .x0000-Bl4AVa'),
            timelineProgress: document.querySelector('.timeline-progress-8T0zHL'),
            titleInput: document.querySelector('[name="titel14"]'), 
            postUrl: '/hazard-voice' 
        }
    };

    // Get the current category selectors (based on categoryId)
    const currentSelectors = selectors[categoryId];

    // Check if all required elements are found in the DOM
    if (!currentSelectors.startButton || !currentSelectors.stopButton || !currentSelectors.checkButton) {
        console.error('One or more required elements are missing in the DOM for category:', categoryId);
        return;
    }

    // Populate the label name input if it exists
    if (currentSelectors.titleInput && labelName) {
        currentSelectors.titleInput.value = labelName;
    }

    // Function to format time in MM:SS format
    function formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    // Function to start the recording
    currentSelectors.startButton.addEventListener('click', () => {
        if (mediaRecorder && mediaRecorder.state === "recording") return; // Prevent multiple recordings

        navigator.mediaDevices.getUserMedia({ audio: true })
            .then(userStream => {
                stream = userStream; // Store the stream in the higher scope variable
                mediaRecorder = new MediaRecorder(stream);
                mediaRecorder.start();
                audioChunks = [];

                mediaRecorder.ondataavailable = event => {
                    audioChunks.push(event.data);
                };

                mediaRecorder.onstop = () => {
                    audioBlob = new Blob(audioChunks, { type: 'audio/webm' }); // Use WebM for compatibility
                    const audioUrl = URL.createObjectURL(audioBlob);
                    const audio = document.createElement('audio');
                    audio.src = audioUrl;
                    document.body.appendChild(audio);

                    // Stop all audio tracks to release the recording indicator
                    stream.getTracks().forEach(track => track.stop());
                };

                // Start timer and timeline animation
                elapsedTime = 0;
                currentSelectors.timerDisplay.textContent = formatTime(elapsedTime);
                currentSelectors.timelineProgress.style.width = '0%';

                timerInterval = setInterval(() => {
                    elapsedTime++;
                    currentSelectors.timerDisplay.textContent = formatTime(elapsedTime);
                    currentSelectors.timelineProgress.style.width = `${(elapsedTime / maxRecordingTime) * 100}%`;

                    // Stop recording automatically after the max recording time
                    if (elapsedTime >= maxRecordingTime) {
                        stopRecording();
                    }
                }, 1000);
            });
    });

    // Function to stop the recording
    currentSelectors.stopButton.addEventListener('click', stopRecording);

    function stopRecording() {
        if (mediaRecorder && mediaRecorder.state === "recording") {
            mediaRecorder.stop();
            clearInterval(timerInterval);
        }
    }

    // Function to handle the "check" button click to submit the data
    currentSelectors.checkButton.addEventListener('click', () => {
        if (!audioBlob) {
            alert('Please record an audio before submitting.');
            return;
        }
    
        const formData = new FormData();
        
        // Append the audio blob with the correct file name and MIME type
        const file = new File([audioBlob], 'voice-memo.webm', { type: 'audio/webm' });
        formData.append('audioMemo', file);
    
        // Also send label name and other necessary fields
        formData.append('label_name', currentSelectors.titleInput ? currentSelectors.titleInput.value.trim() : '');
        formData.append('category_id', categoryId);
        formData.append('public', publicStatus);
    
        // Log the FormData contents for debugging
        for (var pair of formData.entries()) {
            console.log(pair[0]+ ': ' + pair[1]); 
        }
    
        // Send the audio memo and additional data to the server (unified POST request)
        fetch(currentSelectors.postUrl, {
            method: 'POST',
            body: formData
        })
        .then(response => {
            const contentType = response.headers.get("content-type");
            if (contentType && contentType.includes("application/json")) {
                return response.json(); 
            } else {
                return response.text(); 
            }
        })
        .then(data => {
            if (typeof data === 'object') {
                console.log('Server response (JSON):', data);
                if (data.success) {
                    window.location.href = data.redirectUrl; 
                } else {
                    alert('Error uploading voice memo.');
                }
            } else {
                console.error('Non-JSON response from server:', data);
                alert('Error uploading voice memo.');
            }
        })
        .catch(error => {
            console.error('Error uploading voice memo:', error);
        });
    });
});
