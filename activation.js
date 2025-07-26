document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('activation-form');
    const submitButton = document.getElementById('submit-button');
    const messageContainer = document.getElementById('message-container');
    
    // This is a placeholder. We will create this API endpoint in the next step.
    const API_ENDPOINT = 'https://lustroom-downloader-backend.onrender.com/api/v1/activate'; 

    form.addEventListener('submit', function(event) {
        event.preventDefault();

        // Clear previous messages and disable button
        messageContainer.style.display = 'none';
        messageContainer.textContent = '';
        messageContainer.className = 'message';
        submitButton.disabled = true;
        submitButton.textContent = 'Activating...';

        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());

        fetch(API_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        })
        .then(response => response.json().then(json => ({ status: response.status, body: json })))
        .then(result => {
            if (result.status >= 200 && result.status < 300) {
                // Success
                showMessage(result.body.message || 'Activation successful! You can now log in.', 'success');
                form.reset();
                submitButton.textContent = 'Account Created!';
                // Keep the button disabled on success to prevent re-submission
            } else {
                // Error from the API
                showMessage(result.body.message || 'An unknown error occurred.', 'error');
                submitButton.disabled = false;
                submitButton.textContent = 'Create Account';
            }
        })
        .catch(error => {
            console.error('Network or parsing error:', error);
            showMessage('Could not connect to the server. Please try again later.', 'error');
            submitButton.disabled = false;
            submitButton.textContent = 'Create Account';
        });
    });

    function showMessage(text, type) {
        messageContainer.textContent = text;
        messageContainer.className = `message ${type}`;
        messageContainer.style.display = 'block';
    }
});