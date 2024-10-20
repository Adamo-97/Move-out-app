// Handle label deletion (Button)
let isDeleting = false; // Add a flag

function handleLabelDeletion(button) {
    if (isDeleting) return; // Prevent multiple deletions

    isDeleting = true; // Set flag to true

    const labelId = button.getAttribute('data-label-id');

    if (!labelId) {
        console.error('Label ID not found.');
        isDeleting = false; // Reset flag
        return;
    }

    console.log('Delete button clicked for label ID:', labelId);

    if (!confirm('Are you sure you want to delete this label?')) {
        isDeleting = false; // Reset flag if deletion was cancelled
        return;
    }

    fetch('/home', {
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ labelId })
    })
    .then(response => response.json())
    .then(data => {
        isDeleting = false; // Reset flag after request completes
    
        if (data.success) {
            const labelContainer = button.closest('.label-container');
            if (labelContainer) {
                labelContainer.remove(); // Only remove if the container exists
            }
            window.location.reload();
        } else {
            alert('Error deleting label: ' + data.message);
        }
    })
    .catch(error => {
        isDeleting = false; // Reset flag on error
        console.error('Error deleting label:', error);
        alert('Error deleting label.');
    });
}

// Event delegation to handle label deletion based on button class
document.addEventListener('click', function(event) {
    const button = event.target.closest('.remove-button-iv90TT, .remove-button-k5IpBb, .remove-button-NBZXkN'); // Match all delete buttons

    if (!button) return; // No valid button clicked

    // Determine which type of label it is based on the button's class
    if (button.classList.contains('remove-button-iv90TT')) {
        console.log('General label delete button clicked');
        handleLabelDeletion(button); // General labels
    } else if (button.classList.contains('remove-button-k5IpBb')) {
        console.log('Fragile label delete button clicked');
        handleLabelDeletion(button); // Fragile labels
    } else if (button.classList.contains('remove-button-NBZXkN')) {
        console.log('Hazard label delete button clicked');
        handleLabelDeletion(button); // Hazard labels
    }

    event.stopPropagation(); // Stop propagation once one delete action is handled
});