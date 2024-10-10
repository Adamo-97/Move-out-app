function setupPrintButton(buttonId, labelContainerId, labelName) {
    const printButton = document.getElementById(buttonId);
    const labelContainer = document.getElementById(labelContainerId);

    // Debug logs to check if elements are found
    console.log(`Looking for button with ID: ${buttonId}`);
    console.log(`Looking for container with ID: ${labelContainerId}`);

    if (!printButton) {
        console.error(`Print button not found with ID: ${buttonId}`);
    }

    if (!labelContainer) {
        console.error(`Label container not found with ID: ${labelContainerId}`);
    }

    if (!printButton || !labelContainer) {
        return;  // Exit if either is missing
    }

    console.log("Print button and label container found, setting up event listener");

    printButton.addEventListener('click', function () {
        console.log("Print button clicked, capturing label content");

        html2canvas(labelContainer, {
            backgroundColor: null,  // Preserve transparency
            useCORS: true  // Enable cross-origin support if necessary
        }).then(canvas => {
            console.log("Canvas captured, creating image blob");

            // Check if the canvas supports toBlob, otherwise use toDataURL as a fallback
            if (canvas.toBlob) {
                canvas.toBlob(function (blob) {
                    const url = URL.createObjectURL(blob);
                    console.log("Blob created, triggering download");
                    triggerDownload(url, labelName);  // Trigger the download
                }, 'image/png');
            } else {
                // Fallback to toDataURL if toBlob is not supported
                const dataUrl = canvas.toDataURL('image/png');
                console.log("Fallback to dataUrl, triggering download");
                triggerDownload(dataUrl, labelName);  // Trigger the download
            }
        }).catch(error => {
            console.error("Error capturing canvas:", error);
        });
    });
}

function triggerDownload(dataUrl, labelName) {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `${labelName || 'label'}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    console.log("Download triggered, success message displayed");
    alert('Your label has been downloaded successfully!');
}
