document.addEventListener('DOMContentLoaded', function () {
    // Notification bell click listener to toggle the popup
    document.getElementById('notification-bell').addEventListener('click', function () {
        const popup = document.getElementById('notification-popup');
        popup.style.display = popup.style.display === 'none' ? 'block' : 'none';
    });
});

document.addEventListener('DOMContentLoaded', function () {
    const closeButtons = document.querySelectorAll('.cross-icon');

    closeButtons.forEach(button => {
        button.addEventListener('click', function () {
            const notificationId = button.getAttribute('data-id');
            const notificationCard = document.getElementById(`notification-${notificationId}`);
            
            // Make an AJAX request to mark the notification as read
            fetch(`/notifications/mark-as-read/${notificationId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            })
            .then(response => {
                if (response.ok) {
                    // Hide the notification card if successfully updated
                    notificationCard.style.display = 'none';
                } else {
                    console.error('Failed to update notification status');
                }
            })
            .catch(error => console.error('Error:', error));
        });
    });
});
