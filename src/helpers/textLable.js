document.addEventListener('DOMContentLoaded', () => {
    // Define a mapping of category_id to input names for each category
    const categoryMappings = {
        1: { // Fragile
            labelName: 'titel16',
            memo: 'start-typing-here-11',
            queryParamLabel: 'titel113',
        },
        2: { // Hazard
            labelName: 'titel13',
            memo: 'start-typing-here-1',
            queryParamLabel: 'titel112',
        },
        3: { // General
            labelName: 'titel19',
            memo: 'start-typing-here-12',
            queryParamLabel: 'titel114',
        }
    };

    // Extract query parameters from the URL
    const urlParams = new URLSearchParams(window.location.search);
    const categoryId = parseInt(urlParams.get('category_id')); 
    const publicStatus = urlParams.get('public'); // Get the public status as a boolean
    
    // Use the category ID to get the appropriate field names
    const category = categoryMappings[categoryId];

    if (!category) {
        console.error('Invalid category ID provided.');
        return;
    }

    // Get the form inputs based on the category mappings
    const labelNameInput = document.getElementsByName(category.labelName)[0];
    const memoInput = document.getElementsByName(category.memo)[0];
    const checkButton = document.getElementById('check-button');

    // Get the label name from the query parameter and populate the input if it exists
    const labelName = urlParams.get(category.queryParamLabel);
    if (labelName) {
        labelNameInput.value = labelName;
    }

    // Listen for the check button click
    checkButton.addEventListener('click', async (event) => {
        event.preventDefault();

        const labelNameValue = labelNameInput ? labelNameInput.value.trim() : undefined;
        const memo = memoInput ? memoInput.value.trim() : undefined;

        // Debugging: Log the values to be sent to the server
        console.log('Label Name:', labelNameValue);
        console.log('Memo:', memo);
        console.log('Category ID:', categoryId);
        console.log('Public Status:', publicStatus);

        if (!labelNameValue) {
            alert('Label title is required!');
            return;
        }

        try {
            // Send the data to the backend using fetch
            const response = await fetch('/new-lable', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    [category.labelName]: labelNameValue, // Dynamically set the key based on category
                    [category.memo]: memo, // Dynamically set the memo key
                    category_id: categoryId, // Use the category ID
                    public: publicStatus, // Include the public status
                }),
            });

            // Debugging: Log the response status
            console.log('Response Status:', response.status);

            if (response.redirected) {
                // Handle the redirect manually
                window.location.href = response.url;
                return;
            }
            // If no redirect, check for JSON response
            const contentType = response.headers.get('content-type');
            let result;
            if (contentType && contentType.includes('application/json')) {
                result = await response.json();
            } else {
                console.error('Expected JSON response but received:', contentType);
                throw new Error('Unexpected response format');
            }

            console.log('Response Body:', result);

            if (!response.ok) {
                console.error('Server Error:', result);
                alert(`Error creating label: ${result.message}`);
                return;
            }

            if (result.success) {
                // Redirect to the URL provided in the server response
                window.location.href = result.redirectUrl;
            } else {
                alert('Error creating label: ' + result.message);
            }
        } catch (error) {
            console.error('Error during label creation:', error);
            alert('An unexpected error occurred! Check the console for more details.');
        }
    });
});