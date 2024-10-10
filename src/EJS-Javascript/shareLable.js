// Function to toggle the email share form
function toggleEmailShareForm() {
    const form = document.getElementById('emailShareForm');
    const isFormVisible = form.style.display === 'block';

    // Toggle form visibility
    form.style.display = isFormVisible ? 'none' : 'block';
}

// Prevent the form from closing when clicking inside it
document.getElementById('emailShareForm').addEventListener('click', function(event) {
    event.stopPropagation(); // Prevent clicks inside the form from triggering the hide action
});

// Add a click event to hide the form when clicking outside or on the ellipse
document.addEventListener('click', function(event) {
    const form = document.getElementById('emailShareForm');
    const shareButton = document.querySelector('.prev-button-iv90TT');
    
    // Check if the click was outside the form or on the share button
    if (!form.contains(event.target) && !shareButton.contains(event.target)) {
        form.style.display = 'none'; // Hide the form when clicking outside
    }
});

// Add a click event listener to the "Send" button to close the form when clicked
document.querySelector('.Subscribe-btn').addEventListener('click', function() {
    const form = document.getElementById('emailShareForm');
    form.style.display = 'none'; // Hide the form when the "Send" button is clicked
});
