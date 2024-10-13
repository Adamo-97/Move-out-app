document.addEventListener('DOMContentLoaded', function () {
    let selectedImage = null;  // To store the selected image file

    // Define selectors for General, Fragile, and Hazard
    const selectors = {
        3: {  // General
            checkButton: document.querySelector('.done-YH2EbH'),
            cancelButton: document.querySelector('.cancel-YH2EbH'),
            dropArea: document.querySelector('.drop-image-box-YH2EbH'),
            uploadText: document.querySelector('.upload-a-file-YH2EbH'),
            titleInput: document.querySelector('[name="titel111"]'),
            dropMessage: document.querySelector('.drag-an-image-O5hTUX'),
            postUrl: '/general-image',
            labelNameQuery: 'titel114'  // Title query parameter for General
        },
        1: {  // Fragile
            checkButton: document.querySelector('.done-993Wkr'),
            cancelButton: document.querySelector('.cancel-993Wkr'),
            dropArea: document.querySelector('.main-box-993Wkr'),
            uploadText: document.querySelector('.upload-a-file-993Wkr'),
            titleInput: document.querySelector('[name="titel18"]'),
            dropMessage: document.querySelector('.drag-an-image-WxQdCA'),
            postUrl: '/fragile-image',
            labelNameQuery: 'titel113'  // Title query parameter for Fragile
        },
        2: {  // Hazard
            checkButton: document.querySelector('.done-JhWpr9'),
            cancelButton: document.querySelector('.cancel-JhWpr9'),
            dropArea: document.querySelector('.main-box-JhWpr9'),
            uploadText: document.querySelector('.upload-a-file-JhWpr9'),
            titleInput: document.querySelector('[name="titel15"]'),
            dropMessage: document.querySelector('.drag-an-image-KHgnd0'),
            postUrl: '/hazard-image',
            labelNameQuery: 'titel112'  // Title query parameter for Hazard
        }
    };

    // Get the category ID from the URL or use default
    const urlParams = new URLSearchParams(window.location.search);
    const categoryId = urlParams.get('category_id');  // Default to General (ID: 3)
    const { checkButton, cancelButton, dropArea, uploadText, titleInput, dropMessage, postUrl, labelNameQuery } = selectors[categoryId];

    const labelName = urlParams.get(labelNameQuery);  // Fetch the title based on the label type
    const publicStatus = urlParams.get('public') === 'true';  // Parse public status as boolean

    // Populate the title input if available
    if (labelName) {
        titleInput.value = labelName;
    }

    // Handle file drop on the drop area
    dropArea.addEventListener('drop', (e) => {
        e.preventDefault();  // Prevent default behavior (e.g., opening the file in a new tab)
        e.stopPropagation();  // Stop other event handling
        dropArea.classList.remove('dragover');  // Remove the dragover styling

        const files = e.dataTransfer.files;  // Get dropped files
        if (files.length) {
            selectedImage = files[0];  // Store the image file
            console.log('Image file selected:', selectedImage.name);  // Log the file name
            displaySuccessMessage();  // Show success message
        }
    });

    // Handle dragover event
    dropArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropArea.classList.add('dragover');  // Add the dragover styling
        console.log('Dragging over the drop area');
    });

    // Handle dragleave event
    dropArea.addEventListener('dragleave', (e) => {
        dropArea.classList.remove('dragover');  // Remove the dragover styling
        console.log('Left the drop area');
    });

    // Clicking on "upload a file" text to open file explorer
    uploadText.addEventListener('click', openFileExplorer);

    function openFileExplorer() {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';  // Only allow image files
        fileInput.onchange = (e) => {
            selectedImage = e.target.files[0];  // Store the selected image
            console.log('Image selected from explorer:', selectedImage.name);
            displaySuccessMessage();  // Show success message
        };
        fileInput.click();  // Open file explorer
    }

    // Function to display the success message after image selection or drop
    function displaySuccessMessage() {
        dropMessage.textContent = 'Image uploaded';  // Display success message
        const checkMark = document.createElement('span');  // Create a checkmark element
        checkMark.textContent = ' ✓';  // Add a checkmark symbol
        dropMessage.appendChild(checkMark);  // Append checkmark
    }

    // Check button click handler to submit the image
    checkButton.addEventListener('click', () => {
        if (!selectedImage) {
            alert('Please upload an image before submitting.');
            return;
        }

        const formData = new FormData();
        formData.append('image', selectedImage);  // Append the image file
        formData.append('label_name', titleInput.value.trim());  // Append label name
        formData.append('category_id', categoryId);  // Append category ID
        formData.append('public', publicStatus);  // Append public status

        // Send image and additional data to the server
        fetch(postUrl, {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())  // Parse the JSON response
        .then(data => {
            if (data.success) {
                window.location.href = data.redirectUrl;  // Redirect on success
            } else {
                alert('Error uploading image.');
            }
        })
        .catch(error => {
            console.error('Error uploading image:', error);
        });
    });

    // Cancel button click handler to return to the previous page
    cancelButton.addEventListener('click', () => {
        window.location.href = '/home';  // Redirect back on cancel
    });
});
