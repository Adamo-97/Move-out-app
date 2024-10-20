let selectedCategory = '';
let isGlobalNotification = false; // Tracks if it's a notification to all users

// Open notification modal
function openNotificationModal(userId = null) {
    document.getElementById('userId').value = userId || '';  // If userId is null, it means send to all
    isGlobalNotification = !userId; // If no userId, we know it's for all users
    document.getElementById('notificationModal').style.display = 'block';
}

// Close notification modal
function closeNotificationModal() {
    document.getElementById('notificationModal').style.display = 'none';
}

// Select notification category
function selectCategory(category) {
    selectedCategory = category;
    document.getElementById('selectedCategory').value = category;
    const categoryBtns = document.querySelectorAll('.category-btn');
    categoryBtns.forEach(btn => btn.classList.remove('selected'));
    document.querySelector(`[onclick="selectCategory('${category}')"]`).classList.add('selected');
}

// Handle the form submission
document.getElementById('notificationForm').addEventListener('submit', function (e) {
    e.preventDefault();

    const message = document.getElementById('message').value;
    const category = selectedCategory;
    const userId = document.getElementById('userId').value;

    if (!message || !category) {
        alert('Please select a category and enter a message.');
        return;
    }

    // Make an AJAX request to send the notification
    fetch(isGlobalNotification ? '/admin/send-notification/all' : '/admin/send-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            message: message,
            category: category,
            userId: userId
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            closeNotificationModal();
            addNotificationCard(message, category);  // Add notification to the placeholder
        } else {
            alert('Failed to send notification');
        }
    })
    .catch(err => {
        console.error('Error sending notification:', err);
    });
});

// Add sent notification to the list of cards
function addNotificationCard(message, category) {
    const notificationsContainer = document.getElementById('notificationsContainer');
    
    const categoryIcon = {
        'marketing': 'campaign',
        'system': 'build',
        'reminder': 'notifications'
    }[category];

    const cardHTML = `
        <div class="notification">
            <div class="icon">
                <span class="material-icons-sharp">${categoryIcon}</span>
            </div>
            <div class="content">
                <div class="info">
                    <h3>${category.charAt(0).toUpperCase() + category.slice(1)}</h3>
                    <small class="text_muted">${message}</small>
                </div>
            </div>
        </div>
    `;
    
    notificationsContainer.insertAdjacentHTML('beforeend', cardHTML);
}

let selectedFilter = 'all'; // Default filter

function toggleFilterPopup() {
    const filterPopup = document.getElementById('filterPopup');
    filterPopup.style.display = filterPopup.style.display === 'none' ? 'block' : 'none';
}

function selectFilter(filterType) {
    selectedFilter = filterType;

    // Update the filter popup to show the selected filter
    const filterItems = document.querySelectorAll('#filterPopup li');
    filterItems.forEach(item => item.classList.remove('selected')); // Remove 'selected' class from all
    const selectedItem = [...filterItems].find(item => item.onclick.toString().includes(filterType));
    if (selectedItem) selectedItem.classList.add('selected'); // Add 'selected' class to the clicked item

    // Automatically trigger the search with the selected filter
    handleSearch();
}

function handleSearch() {
    const query = document.getElementById('searchInput').value;

    // Make an AJAX request to filter based on the search input and selected filter
    fetch(`/admin/search?query=${query}&status=${selectedFilter}`)
        .then(response => response.json())
        .then(data => {
            // Update the users table dynamically with the filtered results
            updateUsersTable(data.users);
        })
        .catch(error => console.error('Error fetching filtered users:', error));
}

function updateUsersTable(users) {
    const tbody = document.querySelector('tbody');
    tbody.innerHTML = ''; // Clear existing rows

    users.forEach(user => {
        const row = document.createElement('tr');

        row.innerHTML = `
            <td>${user.id}</td>
            <td>${user.name}</td>
            <td>${user.email}</td>
            <td>${user.verified ? 'Yes' : 'No'}</td>
            <td>${user.role}</td>
            <td>${user.is_active ? 'Yes' : 'No'}</td>
            <td>${user.last_active}</td> 
            <td>
                ${user.is_active
                    ? `<form method="POST" action="/admin/deactivate/${user.id}">
                        <button class="deactivate-btn" type="submit">Deactivate</button>
                    </form>`
                    : `<form method="POST" action="/admin/activate/${user.id}">
                        <button class="activate-btn" type="submit">Activate</button>
                    </form>`}
            </td>
            <td>
                <button class="notify-btn" onclick="openNotificationModal('${user.id}')">
                    <span class="material-icons-sharp">email</span>
                </button>
            </td>
        `;

        tbody.appendChild(row);
    });
}

// Automatically trigger search on input change
document.getElementById('searchInput').addEventListener('input', handleSearch);
