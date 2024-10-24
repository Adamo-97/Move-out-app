document.addEventListener('DOMContentLoaded', function () {
    console.log('DOM fully loaded and parsed.');

    // Function to toggle the email share form for a specific label
    window.toggleEmailShareForm = function(labelId) {
        console.log('Toggling email share form for labelId:', labelId);
        const form = document.getElementById(`emailShareForm-${labelId}`);
        
        if (form) {
            const isFormVisible = form.style.display === 'block';
            console.log('Form visibility before toggle:', isFormVisible);
            // Toggle form visibility
            form.style.display = isFormVisible ? 'none' : 'block';
            console.log('Form visibility after toggle:', form.style.display);
            
            // Attach listener for the submit button ONLY when the form is visible
            if (!isFormVisible) {
                addSubscribeEventListener(labelId);
            }
        } else {
            console.log('Form not found for labelId:', labelId);
        }
    };

    // Add event listener for a specific label's subscribe button
    function addSubscribeEventListener(labelId) {
        const button = document.querySelector(`.Subscribe-btn[data-label-id='${labelId}']`);
        if (button) {
            console.log('Adding event listener for Subscribe button with labelId:', labelId);
            
            button.addEventListener('click', function () {
                const email = button.previousElementSibling.value; // Get email from input field
                console.log('Email:', email, 'LabelId:', labelId);
    
                // Debug before sending the request
                console.log('Sending AJAX request to share label...');
    
                // Send an AJAX request to share the label with the entered email
                fetch('/share-label', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ email: email, labelId: labelId })
                })
                .then(response => {
                    console.log('Response received from server:', response);
                    return response.json();
                })
                .then(data => {
                    console.log('Share response data:', data, ' LabelId:', labelId);
                    if (data.success) {
                        alert('Label shared successfully!');
                    } else {
                        alert(data.message); // Display error message if any
                    }
                })
                .catch(error => {
                    console.error('Error sharing label:', error);
                });
            }, { once: true }); // Ensures the listener is added only once per button
        } else {
            console.log('Subscribe button not found for labelId:', labelId);
        }
    }

    // Prevent the form from closing when clicking inside it
    document.querySelectorAll('[id^="emailShareForm-"]').forEach(form => {
        form.addEventListener('click', function(event) {
            console.log('Click inside form, preventing propagation');
            event.stopPropagation(); // Prevent clicks inside the form from triggering the hide action
        });
    });

    // Add a click event to hide the form when clicking outside
    document.addEventListener('click', function(event) {
        const forms = document.querySelectorAll('[id^="emailShareForm-"]');
        const shareButtons = document.querySelectorAll('.prev-button-iv90TT, .prev-button-k5IpBb ');

        forms.forEach(form => {
            const clickedOutsideForm = !form.contains(event.target);
            const clickedOutsideButton = !Array.from(shareButtons).some(button => button.contains(event.target));

            if (clickedOutsideForm && clickedOutsideButton) {
                form.style.display = 'none'; // Hide the form when clicking outside
            }
        });
    });
});
